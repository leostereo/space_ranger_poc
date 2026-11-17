# Contexto Técnico: Creación de la Unidad `shooting_playground`

Este documento resume la arquitectura actual del motor procedural en **BabylonJS + Havok**, las reglas aprendidas y los pasos exactos para implementar la nueva unidad de combate **`shooting_playground`**.

---

## 1. Arquitectura del Pipeline Procedural (Estado Actual)

El juego construye los niveles de forma lineal y data-driven encadenando **unidades (`UnitData`)** sobre el eje `+Z`:

1. **Definición del Nivel (`src/game/levels/definitions/level-08-definition.ts`)**:
   * `LEVEL_08_LAYOUT`: Array secuencial de `UnitData`. Cada unidad recibe su `id`, `kind`, `length`, `distanceToEnable` y `enabledDefault`.
   * `createPreCalculatedSpawns()`: Recorre `LEVEL_08_LAYOUT` usando un cursor `Vector3` (`currentPos`) para calcular posiciones de spawn de enemigos **antes** de instanciar mallas, inyectándoles obligatoriamente `groupId: unit.id`.
   * `buildLevel08Map()`: Llama a `buildLevelUnits(scene, LEVEL_08_LAYOUT)` y clasifica cada `Mesh` en `ground` o `solids` (`StaticSolid[]`) para que `createGroundPhysics` genere los `PhysicsAggregate` de Havok.

2. **Fábrica de Unidades (`src/game/levels/level-builder.ts`)**:
   * Diccionario `UNIT_BUILDERS: Record<UnitKind, UnitBuilderFn>`.
   * Cada builder recibe `(scene, unit, currentPosition, forwardDirection)` y retorna `UnitBuilderResult`: `{ meshes, enemySpawns, centerPosition, nextPosition }`.
   * **Regla crítica de Havok:** Las mallas **deben nacer habilitadas (`setEnabled(true)`)** al construirse en `buildLevelUnits` para que `createGroundPhysics` registre sus cuerpos físicos correctamente. El `EntitiesController` se encarga de apagarlas en el Frame 0 si están fuera de rango.

3. **Culling y Combate (`src/game/controllers/entities-controller.ts`)**:
   * Evalúa cada 200ms la distancia entre `unit.centerPosition` y `character.position` contra `unit.distanceToEnable`.
   * Al activar/desactivar una unidad, alterna `mesh.setEnabled()`, `mesh.isPickable`, `mesh.checkCollisions`, la máscara de Havok (`aggregate.shape.filterCollideMask`) y llama a `enemiesManager.setGroupStatus(unit.id, isActive)`.
   * Escucha `EventManager.on(GameEvents.ProjectileHit, ...)` y si el impacto da en una malla con `metadata.kind === "breakable"`, descuenta `hitsRemaining` y ejecuta `meta.destroy(aggregate)` (explosión en 8 fragmentos + `dispose()`).

---

## 2. Herramientas Reutilizables Disponibles (`src/game/levels/procedural/obstacle-builder.ts`)

Ya contamos con una librería pura de obstáculos con materiales compartidos y bordes iluminados (`EdgesRenderer`), basada en la métrica `PLAYER_HEIGHT = 0.8` y `UNIT = 0.4`:

* **`createCoverBox(scene, opts)`**: Bloque de cobertura táctica (`3 * UNIT = 1.2m` de alto). Ideal para cubrirse de pie o agachado en `shooting_playground`.
* **`createDodgePillar(scene, opts)`**: Pilar alto (`4 * UNIT = 1.6m`).
* **`createBreakableBox(scene, opts)`**: Caja destruible con `hitsRequired` configurable (por defecto `3` disparos) y auto-destrucción física/visual.
* **`createUnitBox(scene, opts)`**: Cubo unitario de `0.4m × 0.4m × 0.4m`.

**Paleta de colores actual:**
* Obstáculos sólidos: Azul marino oscuro (`#1e3a8a`) con bordes celeste eléctrico (`#38bdf8`).
* Bloques destruibles: Azul acero brillante (`#3b82f6`) con bordes blancos.
* *Nota de rendimiento:* Para plazas con muchos bloques, mantener pocas cajas grandes (`CreateBox`) en lugar de cientos de mallas pequeñas para no sobrecargar Havok.

---

## 3. Especificación de la Nueva Unidad: `shooting_playground`

Una arena o plaza de tiro abierta/semi-cerrada donde el jugador avanza cubriéndose detrás de obstáculos mientras enfrenta enemigos (`staticDrone` y/o `dummyTarget`).

### Archivos a modificar / crear:

1. **`src/game/levels/unit-builder.types.ts`**:
   * Agregar `"shooting_playground"` a `UnitKind`.
   * Definir `ShootingPlaygroundConfig`:
     * `width`: Ancho de la plaza (ej: `30` metros, igual que `FLAT_WIDTH` del Nivel 6).
     * `coverRows` / `coverCount`: Cantidad o filas de coberturas (`createCoverBox` y `createBreakableBox`).
     * `staticDroneCount`: Cantidad de drones estáticos al fondo de la plaza.
     * `dummyTargetCount`: Cantidad de blancos de práctica (opcional).

2. **`src/game/levels/builders/shooting-playground.builder.ts`** *(Nuevo archivo)*:
   * Construir el piso rectangular de la plaza (`CreateBox` con dimensiones `width × 0.4 × unit.length`), apoyando su cara superior en `currentPosition.y`.
   * Distribuir las coberturas (`createCoverBox` y `createBreakableBox`) en filas escalonadas o carriles a lo largo de la primera mitad/dos tercios de la plaza para permitir avanzar cubriéndose.
   * Calcular y retornar `centerPosition` y `nextPosition = currentPosition.add(forwardDirection.scale(unit.length))`.

3. **`src/game/levels/level-builder.ts`**:
   * Registrar `shooting_playground: buildShootingPlayground` en `UNIT_BUILDERS`.

4. **`src/game/levels/definitions/level-08-definition.ts`**:
   * En `createPreCalculatedSpawns()`: Agregar el bloque `if (unit.kind === "shooting_playground" && unit.playgroundConfig)` para calcular las posiciones de `staticDrone` (ej: alineados al fondo de la plaza con `fireDelaySeconds` escalonados, mirando hacia `-Z`, y con `groupId: unit.id`) y avanzar `currentPos` en `+Z` por `unit.length`.
   * En `buildLevel08Map()`: Asegurar que el piso de `shooting_playground` (por ejemplo, nombrado `${unit.id}-floor`) se registre en `solids` como `{ mesh, shape: "box" }` para que sostenga al personaje y se apague por culling cuando el jugador se aleje.
