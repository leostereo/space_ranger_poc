# Space Ranger — Guía para crear un nivel (contexto para una IA)

Este documento pone a una IA en contexto para **crear o modificar niveles** (y los enemigos que viven en ellos) en Space Ranger. Está escrito a partir del código y las decisiones tomadas hasta ahora. Las partes que no se pudieron verificar están marcadas en la sección 17.

---

## 1. El juego en un párrafo

Space Ranger es un juego de ciencia ficción en **BabylonJS + TypeScript + Havok** (física v2). Se construyó de forma iterativa con POCs aislados (`src/poc/...`); el juego real vive en `src/game` y reutiliza parte del POC4 (el personaje). El jugador controla un personaje que camina, vuela con jetpack, monta un hoverboard, usa un arma de proyectiles y un escudo. Cada **nivel** tiene un mapa, un punto de aparición del personaje, enemigos y reglas de victoria/derrota.

## 2. Estructura del código (`src/game`)

| Carpeta / archivo | Qué contiene |
|---|---|
| `src/app.ts` | Crea engine, scene y **Havok** (`_setPhysics`), instancia `Game` y corre el render loop. |
| `game.ts` | Raíz de composición: crea servicios, registra la FSM y los estados, engancha las herramientas de debug (solo DEV). |
| `game-context.ts` | `GameContext { scene, engine, canvas, assets: AssetRegistry }`. |
| `fsm/` | `GameFsm` y la interfaz `GameState`. |
| (carpeta de estados) | `SplashState`, `AssetsLoadingState`, `LevelSetupState`, `PlayingState`, `PausedState`, `GameOverState`, `LevelClearedState`, `GameFinishedState`. |
| `levels/` | Todo lo de niveles: definiciones, strategies, loader, scope, sesión, repositorio, luz, física de suelos. |
| `levels/definitions/` | Un archivo por nivel: `level-01-definition.ts`, `level-02-...`, `level-03-...`. |
| `levels/procedural/` | Builders de mapa por código: `ground-builders.ts` (`buildGround`, `buildLandingGround`). |
| `entities/character/` | El personaje (FSM, estrategias de movimiento, input, cámara, HUD de debug). |
| `entities/enemies/` | `enemy.ts`, `enemies-manager.ts`, `enemy-factory.ts`, `dummy-target.ts`, `static-drone.ts`. |
| `assets/` | `asset-loader.ts`, `asset-registry.ts`, `asset-keys.ts`, `animations/`, `materials/`, `prefabs/`. |
| `services/` | `event-manager.ts` (bus global estático) y `event-subscriber.ts`. |
| `core/` | `events/typed-event-emitter.ts`, input (`AnyInputService`, `HotkeyService`), utilidades async. |
| `config/game-config.ts` | `gameConfig.player.height = 0.8` (el modelo del personaje se escala a esta altura). |
| `debug/` | `debug-hud.ts`, `attach-game-debug-hud.ts`, `attach-level-debug-keys.ts`. |
| `ui/`, `screens/` | Pantallas HTML (`HtmlScreen`, `ScreenManager`, `SplashScreen`, `ControlsScreen`, `LoadingScreen`) y su CSS. |
| `src/poc/`, `src/game/setup/backup-*` | Código viejo / respaldos. **No tocar**; están excluidos del `tsc`. |

## 3. Ciclo de vida global (FSM)

Estados (ids): `splash` → `assets-loading` (incluye la pantalla de controles) → `level-setup` → `playing` ⇄ `paused` → `level-cleared` | `game-over` → de nuevo `level-setup` (siguiente nivel pendiente) → `game-finished` cuando no quedan niveles.

- En los comentarios del código los estados están numerados: 2 (carga de assets), 3 (configuración de nivel, con 3A y 3B), 4 (jugando), 6 (nivel completado), 7 (derrota), 8 (juego terminado).
- **3A**: cargar la geometría del nivel (con progreso). **3B**: armar el Character, los enemigos y la strategy, y pasar a `playing`.
- El siguiente nivel es el pendiente de menor `order` (`LevelRepository.getNextPending()`).

Render loop (`app.ts`): cada frame `game.update(dt)` (dt limitado a 1/30 s) y **después** `scene.render()` (solo si hay cámara activa). Por eso toda la lógica de juego corre antes del paso de física del mismo frame.

## 4. Anatomía de un nivel

Un nivel son **datos estáticos** (definición) + **reglas** (strategy), registrados en dos lugares.

### 4.1 `LevelDefinition` (`levels/level-definition.ts`)

```ts
interface LevelDefinition {
  id: string;                     // "level-03" — es la clave del registro de strategies
  order: number;                  // el pendiente de menor `order` es el siguiente
  brief: string;                  // objetivo; se muestra en la pausa
  maps: readonly LevelMapSource[]; // una o más fuentes; entre todas debe haber al menos un suelo
  spawns: LevelSpawns;
  waves: readonly WaveDefinition[]; // hoy no se usa (no hay spawner de oleadas)
  navigation?: LevelNavigation;     // hoy no se usa
}

interface LevelSpawns {
  character: Vector3;             // posición del CENTRO de la cápsula al aparecer (cae sobre el suelo)
  enemies: EnemySpawns;           // por categoría: Partial<Record<EnemyType, EnemySpawn[]>>
  items: readonly Vector3[];      // hoy no se usa
  other: readonly Vector3[];      // hoy no se usa
}

interface EnemySpawn {
  position: Vector3;              // BASE del enemigo (a ras de suelo); el enemigo decide su altura
  forward?: Vector3;              // hacia dónde mira/apunta; por defecto +Z
  fireDelaySeconds?: number;      // retraso del primer disparo (para desfasar enemigos)
}
```

`EnemyType` = `"drone" | "dummyTarget" | "staticDrone"` (`"drone"` aún no tiene builder).

### 4.2 Fuentes de mapa (`maps`)

Un nivel puede combinar varias fuentes, procesadas **en orden**:

- `{ kind: "glb", modelRootUrl, modelFile, rootPosition, rootRotationXDeg, groups, ground }`: se descarga un GLB, se posiciona el root, se **fusionan** las mallas por grupo (`buildings`, `trees`, `roads`, `greenAreas`, `waterways`) y se deja el suelo como malla aparte. Lo usa el nivel 1.
- `{ kind: "procedural", build({ scene, scope }) => { ground?, meshes? } }`: mallas creadas por código. Las devueltas las adopta el `LevelScope`.
  - Helpers: `buildGround({ width, depth, name?, color?, position? })` y `buildLandingGround({ position? })` (3×3, `LANDING_GROUND_SIZE`).
- **El primer suelo de la lista es el principal** (`loadedMap.ground`); ponelo primero. `loadedMap.grounds` tiene todos.

### 4.3 `LevelStrategy` (`levels/level-strategy.ts`) — las reglas

Clase abstracta (template method). Cada nivel hereda e implementa:

```ts
protected abstract onTick(deltaTime: number): void;
protected abstract checkWin(): boolean;
protected abstract checkLose(): boolean;
// opcionales: onPlay(), onPause(), onResume(), onDispose()
```

Dentro de la strategy están disponibles: `this.context` (scene, engine, canvas, assets), `this.definition`, `this.scope`, `this.map`, `this.character` (`CharacterBase`), `this.enemies` (`EnemiesManager`) y `this.characterSpawn`. La strategy **no conoce la FSM**: al terminar emite `levelFinished { outcome: "completed" | "failed" }` y `PlayingState` decide la transición (`completed` → `level-cleared`, `failed` → `game-over`). En derrota además llama `enemies.gameOver()`.

### 4.4 Registro (dos lugares)

1. `LEVEL_DEFINITIONS` (archivo del registro en `levels/`): sumar la definición a la lista.
2. `STRATEGY_BUILDERS` en `levels/level-factory.ts`: `"level-0N": (deps) => new Level0NStrategy(deps)`. Si falta, `createLevelStrategy` lanza un error claro.

## 5. Qué pasa al cargar un nivel (`LevelSetupState.enter`)

1. `levels.getNextPending()`; si no hay → `session.end()` y `game-finished`.
2. `session.begin(definition)` crea el `LevelScope` (libera el nivel anterior).
3. **3A**: `LevelLoader.load(definition, scope)` recorre `definition.maps` y devuelve un `LoadedMap { merged, ground, grounds, proceduralMeshes, droppedMeshCount }`. Progreso real en la pantalla de carga.
4. `session.complete(map)`.
5. **3B** (en este orden):
   - `createGroundPhysics(map, scene, scope)` — un `PhysicsAggregate` estático por suelo.
   - `CharacterBase.create(scene, assets, definition.spawns.character)` → `scope.register(character)`.
   - `createEnemiesManager(definition.spawns.enemies, { scene, registry, isPlayerMesh })` → `scope.register(enemies)`.
   - `createLevelStrategy({ context, definition, scope, map, character, enemies })` → `session.setStrategy(...)`.
6. Transición a `playing`.

**Liberación**: `LevelScope.dispose()` libera en **orden inverso** al registro (enemigos → personaje → física de suelos → luz/cámaras) y al final `root.dispose(false, true)`. Todo lo que cree un nivel debe quedar registrado en el scope (`scope.register(x)` para lo que tenga `dispose()`, `scope.adopt(node)` para colgar nodos de la raíz).

La luz del nivel la crea la clase base (`createLevelLighting`, una `HemisphericLight`).

## 6. Un frame de juego (`LevelStrategy.tick`)

```
Game.update(dt) → FSM → PlayingState → strategy.tick(dt):
  1. character.update(dt)     // input, estrategia de movimiento, FSM del personaje
  2. enemies.update(dt)       // cada enemigo vivo; no corre en pausa
  3. onTick(dt)               // hook del nivel
  4. checkWin() → finish("completed")  |  checkLose() → finish("failed")
```

- `pause()` pone `scene.physicsEnabled = false`, pausa las animaciones en curso y llama `enemies.pause()`. `resume()` lo revierte.
- `finish()` es de una sola vez. `forceOutcome()` es solo para debug.
- El único observer del Character que queda fuera del tick es `onAfterPhysicsObservable` (aplica el roll visual).

## 7. Receta: crear un nivel nuevo

### Paso 1 — Definición: `levels/definitions/level-04-definition.ts`

```ts
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { EnemySpawn, LevelDefinition } from "../level-definition";
import { buildGround, buildLandingGround, LANDING_GROUND_SIZE } from "../procedural/ground-builders";

const GROUND_WIDTH = 10;
const GROUND_DEPTH = 60;
/** Pegado al extremo del ground (fuera de él, para no superponer mallas coplanares). */
const LANDING_POSITION = new Vector3(0, 0, -(GROUND_DEPTH / 2 + LANDING_GROUND_SIZE / 2));
const SPAWN_HEIGHT_MARGIN = 0.5; // el personaje aparece apenas sobre la plataforma y cae

export const level04Definition: LevelDefinition = {
  id: "level-04",
  order: 4,
  brief: "Objetivo que se muestra en la pausa.",
  maps: [
    buildGround({ width: GROUND_WIDTH, depth: GROUND_DEPTH }), // primero: suelo principal
    buildLandingGround({ position: LANDING_POSITION }),
  ],
  spawns: {
    character: LANDING_POSITION.add(new Vector3(0, SPAWN_HEIGHT_MARGIN, 0)),
    enemies: {
      dummyTarget: [{ position: new Vector3(0, 0, 10) }],
      staticDrone: [{ position: new Vector3(0, 0, 20), forward: new Vector3(0, 0, -1), fireDelaySeconds: 1 }],
    },
    items: [],
    other: [],
  },
  waves: [],
};
```

### Paso 2 — Strategy: `levels/level-04-strategy.ts`

```ts
import { LevelStrategy } from "./level-strategy";

export class Level04Strategy extends LevelStrategy {
  protected onTick(_deltaTime: number): void {}
  protected checkWin(): boolean {
    return this.enemies.aliveCount === 0; // ej: todos los blancos destruidos
  }
  protected checkLose(): boolean {
    return this.character.isDead; // o esperar unos segundos para ver la animación de muerte (ver Level03Strategy)
  }
}
```

### Paso 3 — Registrar (4.4): `LEVEL_DEFINITIONS` y `STRATEGY_BUILDERS`.

### Paso 4 — Probar
`npm run dev`, teclas de debug (sección 13) para saltar entre niveles, mirar el HUD de debug y la consola.

## 8. Receta: crear un enemigo nuevo

Contrato (`entities/enemies/enemy.ts`):

```ts
interface Enemy {
  id: string; type: EnemyType; isAlive: boolean;
  ownsMesh(mesh): boolean;          // para resolver a quién alcanzó un proyectil
  update(dt): void; takeHit(hit): void;
  pause(): void; resume(): void; gameOver(): void; dispose(): void; // dispose idempotente
}
```

`EnemyBase` implementa el ciclo de vida: hay que definir `ownsMesh`, `onUpdate`, `onDispose` y, si hace falta, `onHit`, `onPause`, `onResume`, `onGameOver`, `onDestroyed`. Para morir: `this.destroy()` (deja de contar como vivo y suelta recursos; el manager lo libera igual al terminar el nivel, así que el release debe ser idempotente).

Pasos:
1. Agregar el tipo a `EnemyType` en `level-definition.ts`.
2. Crear `entities/enemies/<nombre>.ts` (`class X extends EnemyBase`).
3. Registrarlo en `ENEMY_BUILDERS` de `enemy-factory.ts` (`(spawn: EnemySpawn, id, deps) => new X(id, spawn, deps)`). Si un tipo aparece en un nivel sin builder, `createEnemiesManager` lanza error.
4. Si necesita materiales: ver sección 9.
5. Usarlo en `spawns.enemies` del nivel.

Enemigos existentes:
- **`DummyTarget`** (`dummyTarget`): caja estática de 1,2 × 2 × 0,2 con cuerpo físico `BOX` (masa 0) y `isPickable = true`. Vida 3; cada impacto descuenta el daño del proyectil y destella (`renderOverlay`); a 0 se destruye. `spawn.position` es la base.
- **`StaticDrone`** (`staticDrone`): flota a `HOVER_HEIGHT = 0.7` m sobre `spawn.position`, no se mueve. Cuerpo rectangular, 4 hélices (torus) a los costados, semiesfera inferior y cañón. Gira en yaw hacia `forward` y el cañón se inclina para apuntar exacto. Dispara cada 3 s con un `ProjectileWeaponController` (proyectiles lentos, 10 m/s). Hoy sin física ni vida.

## 9. Assets y materiales compartidos

- `AssetLoader` (estado de carga) descarga la textura `flare`, la imagen `keymap` y el GLB `character-model` (escalado a `gameConfig.player.height`) y arma el set de animaciones. En su último paso **registra materiales procedurales**: `board`, `dummy-target`, `static-drone-body`, `static-drone-accent`.
- `AssetRegistry`: `getTexture`, `getImage`, `getMesh(key, clone, prefix)`, `getMaterial(key)`, `getCharacterInstance(prefix)` (copia clonada del personaje + animaciones remapeadas).
- **Regla de materiales**: se crean **una vez** en el loader y se comparten. Quien los usa **no los libera** (`mesh.dispose()` sin `disposeMaterialAndTextures`; `root.dispose(false, false)`); los libera `AssetRegistry.dispose()`.
- Para un material nuevo: clave en `asset-keys.ts` (`MaterialAssetKey`), función creadora en `assets/materials/<nombre>-factory.ts` y una línea `registerMaterial(...)` en `asset-loader.ts`.
- Prefabs (`assets/prefabs/`): arma, escudo, propulsores y board (elipsoide con cola). Reciben `prefix` para nombrar las copias (`"player:"` para el personaje).
- **No hay GLB de skateboard**: el board es procedural.

## 10. El personaje (lo que un nivel debe saber)

- Se crea con `CharacterBase.create(scene, registry, spawn)`; la posición se aplica **antes** de crear el `PhysicsAggregate` (Havok toma la posición al construirlo).
- API usada por niveles/enemigos: `update(dt)`, `activateCamera()`, `isPlayerMesh(mesh)`, `isDead`, `dispose()`.
- **Cámara**: `FollowCamera` (`character.camera.ts`: radius 10, heightOffset 4, rotationOffset 180, aceleración 0.05, velocidad máx 20). `LevelStrategy.play()` la activa. Al montarse al board, `lockedTarget` pasa al board.
- **Vidas**: `INITIAL_LIVES = 3` (`character-health.ts`). Cada impacto resta una; en la última muere.
- **Cápsula**: no es pickable a propósito (para que el raycast de suelo no la detecte); por eso el arma tiene la opción `isExtraTarget`.
- **Intocable** en jetpack, aire, aterrizajes, rodadas y hoverboard (`canReceiveHit()` es falso). Para que un enemigo lo dañe tiene que estar caminando/en el suelo.
- Modos de movimiento: stand-alone, jetpack, hoverboard (cada uno con controller de física, de input, de animación y su arma).
- Constantes compartidas: `entities/character/character.constants.ts` (`CHARACTER_MASS = 70`, `CHARACTER_CAPSULE_HEIGHT`, radio y puntos de cápsula). Las del board: `strategies/hover-board/hover-board.constants.ts`.

## 11. Eventos (conviven dos mecanismos)

| | `TypedEventEmitter` | `EventManager` (estático) |
|---|---|---|
| Alcance | Una instancia por objeto | Bus global |
| Uso | Un objeto avisa a quien lo posee/conoce | Avisos entre sistemas desacoplados |
| Ejemplos | `fsm.events`, `loader.events`, `strategy.events` (`levelFinished`) | `PlayerShooted`, `PlayerDamaged`, `PlayerDied`, `ProjectileHit` |

Quien se suscribe al `EventManager` debe usar `EventSubscriber` (`registerEvents` + `listen` + `subscribeEvents()` + `unsubscribeEvents()` en `dispose()`); si no, quedan handlers colgados entre niveles.

**Flujo de un disparo**:
```
ProjectileWeaponController (raycast por paso, scene.pickWithRay)
  → EventManager.emit(ProjectileHit { mesh, point, direction, damage, sourceId })
     ├─ EnemiesManager: busca el enemigo con ownsMesh(mesh) → enemy.takeHit(hit)
     └─ CharacterBase: si isPlayerMesh(mesh) → _onPlayerShooted → pierde vida
                        → emite PlayerDamaged / PlayerDied → FSM del personaje (HitStun / Dead)
```

`ProjectileWeaponController` admite `ProjectileWeaponOptions { sourceId?, isExtraTarget?, initialDelaySeconds? }` y una `ProjectileWeaponConfig` (cadencia, velocidad, daño, pools, colores).

## 12. Física: reglas y trampas

- Havok se inicializa en `app.ts` (gravedad −9,81).
- `createGroundPhysics` crea un `PhysicsAggregate` `BOX` estático por cada suelo. **Sirve para los suelos procedurales; para el suelo del GLB del nivel 1 hará falta `MESH`** (y cuerpo para los edificios): pendiente.
- Poner la posición del mesh **antes** de crear el aggregate.
- Los proyectiles no son cuerpos físicos: se mueven a mano y detectan golpes con raycast sobre meshes `isPickable` (más los `isExtraTarget`). Un enemigo que deba recibir disparos necesita `isPickable = true` y `ownsMesh`.
- Evitar mallas coplanares superpuestas (parpadeo): el landing va junto al ground, no encima.

## 13. Debug (solo DEV, `import.meta.env.DEV`)

- Teclas: **1** = completar el nivel, **2** = fallarlo, **Esc/P** = pausa. Sirven para recorrer niveles sin gameplay completo.
- `DebugHud` arriba a la derecha: estado de la FSM, nivel cargado (`level`) y log de transiciones.
- `CharacterHud` arriba a la izquierda: ruta de estados del personaje (`HoverBoard > Hovering > ...`).
- Inspector de Babylon: Shift+Ctrl+Alt (solo DEV).
- `npx tsc --noEmit` para verificar tipos.

## 14. Niveles existentes

| Nivel | Contenido | Reglas |
|---|---|---|
| `level-01` | Mapa GLB (Batalla del Pilar, fusionado por grupos), sin enemigos | Placeholder: `checkWin/checkLose` en `false` (se pasa con las teclas de debug). El suelo GLB aún no tiene la física correcta. |
| `level-02` | Suelo 10×60 + landing 3×3 en z = −31,5; 3 `dummyTarget` | Gana al destruir los 3 (`enemies.aliveCount === 0`). |
| `level-03` | Mismo layout; 3 `staticDrone` apuntando en horizontal al landing, con desfase de disparo | No se gana; pierde 2,5 s después de que el personaje muere (deja ver la animación). Sirve para probar la muerte. |

## 15. Convenciones

**Código**
- Constantes dentro de cada clase/archivo; sin config global (`generalConfig` del POC ya no se usa). Solo se comparte un valor si se repite en varios lugares.
- Nombres de archivo en kebab-case; tipos de enemigo y claves de definición en camelCase (`dummyTarget`, `staticDrone`); ids de nivel `level-0N`; claves de assets en kebab-case.
- Imports de tipos con `import type`. Todo lo que cree un nivel se registra en el `LevelScope`.
- Código de debug siempre bajo `import.meta.env.DEV`.
- Los textos de UI están en inglés.

**Colaboración (cómo prefiere recibir el código el dueño del proyecto)**
- Responder en español.
- **Archivos nuevos**: completos, listos para copiar y pegar.
- **Modificaciones**: un bloque *Buscar* (texto exacto, único en el archivo) y otro *Reemplazar por*.
- Proponer el diseño antes de escribir código cuando falten archivos; pedir los archivos concretos en lugar de adivinar firmas.

## 16. Pendientes y limitaciones conocidas

- Nivel 1: física `MESH` para el suelo del GLB y cuerpo para los edificios; reglas reales de victoria/derrota.
- `StaticDrone`: sin física, sin flotación/pitch/roll y sin vida (más adelante).
- Oleadas (`waves`), `items`, `other` y `navigation` están definidos en los tipos pero no se usan.
- `EnemyType "drone"` no tiene builder.
- Dos mecanismos de eventos conviviendo; idea pendiente: que el bus estático sea el general del juego y que sea una instancia creada por `Game` y pasada por `GameContext`.
- HUD del Character y HUD de debug del juego quedaron separados a propósito.
- Hay un `GameFsm` con más estados de los que usa este documento en detalle (`PausedState`, `GameOverState`, `LevelClearedState`): ver sus archivos para el comportamiento exacto (reintento, siguiente nivel).

## 17. Incertidumbres de este documento

Para no inventar, estas cosas **no se verificaron** y conviene mirarlas en el repo:
- Nombres exactos de algunos archivos/carpetas: la carpeta de los estados de la FSM, el archivo que exporta `LEVEL_DEFINITIONS`, y la subcarpeta de `ProjectileWeaponController` dentro de `entities/character/strategies/`.
- Dónde se invoca `strategy.play()` y qué hace `PlayingState` además de escuchar `levelFinished`.
- La API completa de `LevelSession` y `LevelRepository` (persistencia de niveles completados con `createSafeStorage()`).
- Comportamiento de `GameOverState` y `LevelClearedState`.

## 18. Qué archivos pegarle a otra IA (orden recomendado)

1. Este documento.
2. `levels/level-definition.ts`, `levels/level-strategy.ts`, `levels/level-factory.ts`, el registro con `LEVEL_DEFINITIONS`.
3. Un nivel de referencia completo: `level-03-definition.ts` + `level-03-strategy.ts`.
4. `states/level-setup-state.ts`.
5. `entities/enemies/enemy.ts`, `enemy-factory.ts`, `enemies-manager.ts` y un enemigo (`static-drone.ts`).
6. `assets/asset-registry.ts`, `assets/asset-loader.ts`, `assets/asset-keys.ts`.
7. `services/event-manager.ts`.
8. Según la tarea: `levels/procedural/ground-builders.ts`, `levels/level-loader.ts`, `levels/level-scope.ts`, `character.base.ts`.