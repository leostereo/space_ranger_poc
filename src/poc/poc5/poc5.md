# Arquitectura del Sistema de Control de Personajes (FSM & Controllers)
## Preparación para POC5 - Proyecto Space Ranger

Este documento recopila el diseño de arquitectura debatido para estructurar el controlador del personaje principal. El objetivo es eliminar los bloques masivos de `if/else`, desacoplar la lógica visual de la física, y permitir conjuntos de comportamiento intercambiables (ej. a pie, en patineta o en escaleras).

---

## 🏛️ 1. Pilares de la Arquitectura (Separación de Responsabilidades)

Para evitar el acoplamiento y el "código espagueti", establecemos una regla de oro: **Los controladores nunca se hablan entre sí directamente.** La Máquina de Estados Finitos (FSM) funciona como el único director de orquesta.

```
       +------------------------------------+
       |          LOOP PRINCIPAL            |  (BabylonJS Render Loop)
       +-----------------+------------------+
                         |
                         v
               +-------------------+
               |  PERSONAJE (Ctx)  |
               +---------+---------+
                         |
                         v
               +-------------------+
               |    FSM ACTIVA     |
               | (Estado Actual)   |
               +---+-----------+---+
                   |     |     |
    +--------------+     |     +---------------+
    |                    |                     |
    | A) LEE (Sondeo)    | B) ORDENA           | B) ORDENA
    v                    v                     v
+------------+     +------------+        +------------+
|   INPUT    |     |   FISICA   |        | ANIMACION  |
| CONTROLLER |     | CONTROLLER |        | CONTROLLER |
+------------+     +------------+        +-----+------+
                         ^                     |
                         | C) AVISA            | C) AVISA
                         |    (Eventos)        |    (Callbacks)
                         |    "¡Suelo!"        |    "¡Terminé!"
                         +---------------------+
```

### ⌨️ A. Input Controller (Manejo de Intenciones)
*   **Responsabilidad:** Captura eventos de teclado/joystick de BabylonJS y los mapea a estados booleanos o vectores simples (`isMoving`, `wantsToJump`).
*   **Comunicación hacia la FSM:** **Sondeo (Polling).** La FSM inspecciona sus variables de forma activa dentro de su bucle `actualizar()` cada frame. No dispara eventos hacia la FSM para evitar saturación de memoria.

### 🧲 B. Física Controller (Manejo de Fuerzas y Colisiones)
*   **Responsabilidad:** Controla el impostor físico (Havok), velocidades, fuerzas e impulsos aplicados al Mesh del personaje.
*   **Comunicación hacia la FSM:** Mixta.
    *   *Datos continuos (Velocidad):* Sondeo. La FSM los lee cuando los necesita.
    *   *Sucesos discretos (Aterrizar, impactos):* **Eventos.** El controlador de física expone un sistema de suscripción para que la FSM sepa exactamente cuándo se tocó el suelo sin consultar en cada frame.

### 🎬 C. Animación Controller (Manejo Visual Pasivo)
*   **Responsabilidad:** Controla de manera exclusiva los `AnimationGroups` de BabylonJS. No toma decisiones de lógica de juego.
*   **Comunicación hacia la FSM:** **Callbacks puntuales.** Recibe órdenes directas de la FSM sobre qué reproducir. Si una animación requiere sincronización (como un despegue en dos etapas), el controlador acepta una función callback que ejecuta inmediatamente al terminar la animación o alcanzar un frame específico.

---

## 🕒 2. Flujo Cronológico: El Salto en Dos Etapas

Este caso de uso demuestra cómo cooperan los controladores a través de la FSM sin conocerse entre sí:
1. El estado **`TomandoImpulso`** le ordena al controlador de animación reproducir el agachado y le pasa una función (callback).
2. El controlador de animación trabaja de forma aislada. Al terminar, ejecuta el callback.
3. La FSM recibe el aviso del callback y cambia al estado **`Saltando`**.
4. Al entrar a `Saltando`, la FSM le ordena al controlador de física aplicar el impulso vertical hacia arriba.

```
 JUGADOR             INPUT            FSM (Estado: Reposo)     ANIMACIÓN          FÍSICA
   |                   |                       |                   |                 |
   |-- Presiona Espacio|                       |                   |                 |
   |------------------>|                       |                   |                 |
   |                   |                       |                   |                 |
   |                   |-- [Actualizar Frame] -|                   |                 |
   |                   |   salto = true        |                   |                 |
   |                   |---------------------->|                       |                 |
   |                   |                       |-- Cambia estado a |                 |
   |                   |                       |   "TomandoImpulso"|                 |
   |                   |                       |------------------>|                 |
   |                   |                       |   play("impulso", |                 |
   |                   |                       |   callback)       |                 |
   |                   |                       |                   |-- Se reproduce  |
   |                   |                       |                   |   la animación  |
   |                   |                       |                   |                 |
   |                   |                       |                   |-- [Termina]     |
   |                   |                       |<-- (¡Aviso!) -----|                 |
   |                   |                       |   Ejecuta callback|                 |
   |                   |                       |                   |                 |
   |                   |                       |-- Cambia estado a |                 |
   |                   |                       |   "Saltando"      |                 |
   |                   |                       |------------------------------------>|
   |                   |                       |                   |  aplicarImpulso(|
   |                   |                       |                   |  haciaArriba)   |
```

---

## 📐 3. Patrones de Diseño Utilizados

Para garantizar la escalabilidad en **POC5**, utilizaremos una combinación de patrones:

1.  **Patrón State (Caso A):** Cada estado es una clase TypeScript individual con métodos de ciclo de vida (`entrar()`, `actualizar()`, `salir()`). Reciben la referencia del `Personaje` para interactuar con sus controladores.
2.  **Patrón Hierarchical State Machine (HFSM):** Para el modo "A Pie", se implementarán estados padres (como `EnElSuelo` y `EnElAire`) que contendrán reglas globales (como la transición a recibir daño o saltar), reduciendo la duplicación de código en sub-estados como `Caminando` o `Corriendo`.
3.  **Patrón Strategy (Estrategias de Locomoción):** Las FSMs completas se tratarán como piezas intercambiables. El personaje tendrá un mánager que podrá "desenchufar" la FSM de *A Pie* e "enchufar" la de *Patineta* o *Escalera*, cambiando por completo la política de transiciones y estados válidos según el contexto físico.

---

## 🛠️ 4. Política de Transiciones para POC5

Para mantener la rigidez y predictibilidad del flujo de juego, implementaremos dos estrategias según el nivel:

*   **Sub-FSMs (Nivel Micro):** Utilizarán transiciones descentralizadas (el propio estado evalúa las condiciones de input en su método `actualizar()`).
*   **FSM Principal (Nivel Macro):** Utilizarán una **Tabla de Transiciones Centralizada (Mapa de Clases)**. Se configurará una lista de transiciones permitidas del tipo `EstadoActual + Evento = SiguienteEstado`. Si un cambio no está registrado en la política activa, la FSM lo bloqueará automáticamente, impidiendo anomalías visuales o físicas (como saltar de una escalera vertical usando las mecánicas de caminar).

---
*Documento generado automáticamente para la preparación del código base de POC5 en el repositorio space_ranger_poc.*
