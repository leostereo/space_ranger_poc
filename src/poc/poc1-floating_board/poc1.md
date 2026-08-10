# POC 1 — Floating Board

## Objetivo

Validar la factibilidad técnica del vehículo principal del juego: una patineta que **flota y se desplaza tanto sobre el suelo de una ciudad como en el vacío del espacio** entre ciudades flotantes.

Este POC busca resolver:
- El efecto de levitación (idle, sin fuerzas externas).
- El comportamiento físico al moverse sobre `ground` vs. sin `ground`.
- Las mecánicas de salto/boost en ambos contextos.

Queda **fuera de alcance** de este POC: el personaje montándose/bajándose del board y el intercambio de control (eso es POC 2), el modelo 3D final (se usa un box placeholder), y el jetpack (ascenso sostenido entre niveles de ciudad — se diseña más adelante).

## Requerimiento central

El board debe poder **flotar y moverse con o sin `ground` debajo**. Esto descarta un diseño basado únicamente en raycast-al-piso (no funciona en el vacío) y lleva a un diseño de **dos estados** determinados en cada frame por la presencia o ausencia de `ground` detectado.

## Diseño de estados

### `Grounded` (hay ground detectado por raycast, dentro de rango + coyote time)
- Movimiento **estrictamente horizontal**.
- Altura sostenida por un **spring-damper** hacia una altura objetivo oscilante (seno/coseno), lo que da el efecto de leve sube-baja característico, sin depender de física acumulativa.
- Siempre nivelado (sin tilt por terreno) — simplificación deliberada para este POC.
- Sub-estado **`Jumping`**: impulso vertical clásico; la gravedad/spring lo trae de vuelta a la altura de hover al aterrizar.

### `Falling` (no hay ground detectado)
- Movimiento horizontal se mantiene.
- Velocidad vertical **siempre neta negativa** — el board nunca puede ganar altura por sí solo en este estado. La pendiente de caída (qué tan pronunciada) se controla con input directo del jugador.
- Sub-estado **`GliderBoost`**: mismo botón que `Jumping`, pero acá es una maniobra de planeador (pitch-up + lift momentáneo) en vez de un salto. Potencia decreciente en usos sucesivos (×0.6 cada vez), se resetea al volver a `Grounded`.

### Transición entre estados
- Determinada 100% por el resultado del raycast hacia abajo — no hay "zonas" explícitas de ciudad/espacio.
- Coyote time (0.15s) para tolerar pérdidas de contacto momentáneas (bordes de plataforma) sin caer a `Falling` de inmediato.

### Futuro: `Boosting` (jetpack)
Único estado que permitirá ascenso sostenido, para viajar entre ciudades a distinto nivel de altura. Todavía no diseñado — se aborda cuando este POC esté validado.

## Notas de implementación

- Físicas con Havok (`PhysicsAggregate`), no kinemático puro — se eligió priorizar comportamiento físico real por sobre velocidad de desarrollo, dado que el personaje eventualmente necesita pararse/colisionar con el board (POC 2).
- Valores iniciales de tuning en `config.ts` (`hover`, `falling`, `groundCheck`, `boost`) — se ajustan iterando en el editor, no son definitivos.

## Progreso

- [x] **Paso 1** — Crear el board: mesh + `PhysicsAggregate` (board dinámico, ground estático).
- [x] **Paso 2** — Efecto de levitación en idle (cancelar gravedad + spring-damper hacia altura oscilante).
- [ ] **Paso 3** — Fuerzas / input para movimiento horizontal y transición `Grounded` ↔ `Falling`.
  - [x] Giro (A/D) vía velocidad angular directa sobre el body.
  - [x] Fuerza forward (Shift) en la dirección hacia donde apunta la trompa del board (control tipo vehículo).
  - [x] Salto simple (Space) — impulso vertical sin decaimiento todavía.
  - [x] Impulso de test (T) para simular el peso del personaje aterrizando.
  - [ ] Estado `Falling` (sin ground detectado) + pendiente de caída controlada por input.
  - [ ] Sub-estado `GliderBoost` con decaimiento sucesivo.
  - [ ] FSM anidada formal (Grounded/Falling + sub-estados) documentada en Mermaid.