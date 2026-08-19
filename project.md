# Space Ranger — Sandbox de POCs

Repo base clonado de [bp900](https://github.com/eldinor/bp900) (sugerido por la documentación oficial de BabylonJS), usado como entorno de pruebas para validar la factibilidad de las distintas mecánicas del juego antes de portarlas al proyecto final.

## Concepto general

Juego sci-fi donde el personaje puede movilizarse mediante múltiples tipos de vehículos. El primero a prototipar es una **patineta flotante** estilo Volver al Futuro.

## Relación con Space Freesbe

Este sandbox reutiliza y evoluciona parte de la arquitectura ya validada en [Space Freesbe](https://github.com/) (proyecto previo del mismo autor), evitando errores de diseño detectados en ese proyecto.

### Se reutiliza
- **Command Dispatcher** (Command Pattern) para el manejo de input.
- Convenciones generales de arquitectura: `async build()`, singletons, `config` centralizado sin magic numbers, separación clara por secciones.

### Se rehace desde cero
- **FSM (Finite State Machine)**: se descarta la implementación anterior (`BaseStateMachine<TState>`). La nueva FSM será **anidada** (nested states), para soportar mejor los distintos modos de control del personaje (a pie, en board, etc. y sus sub-estados internos).
- El diseño de cada FSM se documenta aparte en un archivo `.md` con diagramas **Mermaid**, mantenido actualizado a medida que la máquina de estados evoluciona.

## Estructura del repo

Selector de escenas como entry point, desde donde se accede a cada POC de forma aislada.

```
src/
  poc/
    poc1-floating_board/
    poc2-.../
```

Cada POC vive en su propia carpeta bajo `src/poc/`, con nomenclatura `pocN-nombre_descriptivo`.

## Lista de POCs

| # | POC | Objetivo |
|---|-----|----------|
| 1 | Floating board | Efecto visual de flotación + controller propio del vehículo (física, inclinación, aceleración, drift) |
| 2 | Transición personaje ↔ board | Montar/desmontar (visual + animaciones) e intercambio de control entre personaje a pie y personaje sobre el board |

*(lista abierta, se irá ampliando a medida que se definan más vehículos/mecánicas)*

## Documentación de estados

Cada FSM del proyecto tendrá su propio archivo de documentación en Markdown con diagramas Mermaid, ubicado junto al POC correspondiente (a definir convención exacta de path/nombre).