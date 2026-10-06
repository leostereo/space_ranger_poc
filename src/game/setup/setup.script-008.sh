#!/usr/bin/env bash
# setup.script-008 — Estado 3A real: carga del nivel con LevelScope, progreso y estado 8.
# Ejecutar parado en /src:   bash game/setup/setup.script-008.sh
#
# Qué hace:
#   levels/level-scope.ts        LevelScope: dueño de TODO lo que crea un nivel; un dispose() lo libera
#   levels/level-session.ts      LevelSession: el nivel cargado ahora (sobrevive entre estados)
#   levels/level-map-factory.ts  createLevelMap: root, fusión de grupos, suelo, limpieza y cancelación
#   levels/level-loader.ts       LevelLoader: descarga el GLB con progreso y delega en createLevelMap
#   levels/level-viewer-factory  PLACEHOLDER: cámara orbital + luz para ver el nivel (lo reemplaza 3B)
#   core/async/yield-to-browser  cede el hilo para que la barra de progreso se pinte
#   estado 8 real                GameFinishedState + GameFinishedScreen (press any key: borra progreso y vuelve al splash)
#   Actualiza 3 archivos SOLO si no los editaste (si no, deja <archivo>.new):
#     assets/asset-loader.ts     la carga de assets comunes ahora es idempotente (al volver al splash no recarga)
#     states/level-setup-state.ts  deja de ser placeholder: implementa 3A
#     game.ts                    arma LevelRepository, LevelSession, LevelLoader y registra los estados
set -euo pipefail

if [[ "$(basename "$PWD")" != "src" ]]; then
  echo "Error: ejecutá este script parado en la carpeta src (actual: $PWD)" >&2
  exit 1
fi

BOOT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ ! -f "$BOOT_DIR/_lib.sh" ]]; then
  echo "Error: falta $BOOT_DIR/_lib.sh (lo crea setup.script-001.sh)" >&2
  exit 1
fi
# shellcheck source=_lib.sh
source "$BOOT_DIR/_lib.sh"

setup_begin "$0"
setup_requires "setup.script-007.sh"

echo "-- archivos nuevos"

write_file "game/core/async/yield-to-browser.ts" <<'EOF'
/** Si requestAnimationFrame no corre (pestaña oculta) se continúa igual pasado este tiempo. */
const FALLBACK_TIMEOUT_MS = 50;

/**
 * Cede el hilo al navegador para que pueda pintar (ej: actualizar una barra de progreso)
 * entre dos tareas pesadas y síncronas.
 */
export function yieldToBrowser(): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    const hasAnimationFrames = typeof requestAnimationFrame === "function";
    if (hasAnimationFrames) {
      requestAnimationFrame(() => setTimeout(finish, 0));
    }
    setTimeout(finish, hasAnimationFrames ? FALLBACK_TIMEOUT_MS : 0);
  });
}
EOF

write_file "game/levels/level-scope.ts" <<'EOF'
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Dueño de TODO lo que se crea para un nivel. Al terminar el nivel un solo dispose() lo libera:
 * los nodos colgados de `root` y cualquier cosa registrada (cuerpos de Havok, observers, cámaras...).
 */
export class LevelScope {
  readonly root: TransformNode;

  private readonly disposers: (() => void)[] = [];
  private disposed = false;

  constructor(
    scene: Scene,
    readonly levelId: string,
  ) {
    this.root = new TransformNode(`level-root:${levelId}`, scene);
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Registra algo para liberar junto con el nivel (en orden inverso al de registro).
   * Si el scope ya fue liberado, lo libera de inmediato: así una carga cancelada no deja basura.
   */
  register<T extends { dispose(): void }>(item: T): T {
    if (this.disposed) {
      item.dispose();
    } else {
      this.disposers.push(() => item.dispose());
    }
    return item;
  }

  /** Cuelga un nodo de la raíz del nivel conservando su transform en el mundo. */
  adopt<T extends TransformNode>(node: T): T {
    node.setParent(this.root);
    return node;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const dispose of this.disposers.reverse()) {
      try {
        dispose();
      } catch (error) {
        console.error(`[LevelScope] failed to dispose a resource of "${this.levelId}"`, error);
      }
    }
    this.disposers.length = 0;
    this.root.dispose(false, true); // hijos + sus materiales y texturas
  }
}
EOF

write_file "game/levels/level-map-factory.ts" <<'EOF'
import { Axis, Space } from "@babylonjs/core/Maths/math.axis";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Tools } from "@babylonjs/core/Misc/tools";

import { yieldToBrowser } from "../core/async/yield-to-browser";
import type { MapDefinition, MapMeshGroup, MapMeshMatcher, MapMeshRole } from "./level-definition";
import type { LevelScope } from "./level-scope";

/** Nombre del nodo raíz que el loader de glTF crea alrededor de cada GLB. */
const GLTF_ROOT_NODE_NAME = "__root__";

// Parámetros de Mesh.MergeMeshes (el parámetro allow32BitIndices viene de cada grupo).
const MERGE_DISPOSES_SOURCE = true;
const MERGE_SUBDIVIDES_WITH_SUBMESHES = false;
const MERGE_USES_MULTI_MATERIALS = true;

export interface LoadedMap {
  readonly merged: ReadonlyMap<MapMeshRole, Mesh>;
  readonly ground: Mesh;
  /** Mallas del GLB que no pertenecen a ningún grupo ni al suelo y se descartaron. */
  readonly droppedMeshCount: number;
}

const matches = (name: string, matcher: MapMeshMatcher): boolean =>
  "includes" in matcher ? name.includes(matcher.includes) : matcher.pattern.test(name);

/**
 * Convierte las mallas importadas del GLB del mapa en el mapa listo para jugar:
 * posiciona el root, fusiona cada grupo en una sola malla (menos draw calls), deja el suelo
 * como malla independiente y descarta el resto. Todo queda adoptado por `scope`.
 *
 * Devuelve null si el scope se liberó mientras trabajaba (carga cancelada): en ese caso
 * limpia todo lo importado. Lanza (también limpiando) si el GLB no tiene root o no tiene suelo.
 */
export async function createLevelMap(
  importedMeshes: readonly AbstractMesh[],
  map: MapDefinition,
  scope: LevelScope,
  /** Progreso del procesamiento, de 0 a 1. */
  onProgress?: (fraction: number) => void,
): Promise<LoadedMap | null> {
  const root = importedMeshes.find((mesh) => mesh.name === GLTF_ROOT_NODE_NAME);
  if (!root) {
    importedMeshes.forEach((mesh) => mesh.dispose(false, true));
    throw new Error(`[createLevelMap] the GLB has no "${GLTF_ROOT_NODE_NAME}" node`);
  }
  const discardImported = (): void => root.dispose(false, true);

  if (scope.isDisposed) {
    discardImported();
    return null;
  }

  // 1. El root a su posición de juego ANTES de fusionar: las mallas calculan sus coordenadas con él.
  root.position.copyFrom(map.rootPosition);
  root.rotate(Axis.X, Tools.ToRadians(map.rootRotationXDeg), Space.LOCAL);
  root.setEnabled(true);

  // 2. Cada malla va a su primer grupo (o es el suelo): ninguna se usa dos veces.
  const meshesByGroup = new Map<MapMeshGroup, Mesh[]>();
  let ground: Mesh | null = null;
  let droppedMeshCount = 0;
  for (const mesh of importedMeshes) {
    if (mesh === root || !(mesh instanceof Mesh) || !mesh.name) {
      continue;
    }
    if (!ground && matches(mesh.name, map.ground.match)) {
      ground = mesh;
      continue;
    }
    const group = map.groups.find((candidate) => matches(mesh.name, candidate.match));
    if (group) {
      meshesByGroup.set(group, [...(meshesByGroup.get(group) ?? []), mesh]);
    } else {
      droppedMeshCount++;
    }
  }
  if (!ground) {
    discardImported();
    throw new Error(`[createLevelMap] no mesh of the GLB matches the ground "${map.ground.name}"`);
  }

  // 3. Fusionar de a un grupo, cediendo el hilo entre grupos para que la barra de progreso se pinte.
  const merged = new Map<MapMeshRole, Mesh>();
  for (let index = 0; index < map.groups.length; index++) {
    const group = map.groups[index];
    onProgress?.(index / map.groups.length);
    await yieldToBrowser();
    if (scope.isDisposed) {
      discardImported();
      return null;
    }

    const meshes = meshesByGroup.get(group);
    if (!meshes || meshes.length === 0) {
      continue;
    }
    meshes.forEach((mesh) => mesh.computeWorldMatrix(true));
    const fused = Mesh.MergeMeshes(
      meshes,
      MERGE_DISPOSES_SOURCE,
      group.allow32BitIndices,
      undefined,
      MERGE_SUBDIVIDES_WITH_SUBMESHES,
      MERGE_USES_MULTI_MATERIALS,
    );
    if (!fused) {
      console.warn(`[createLevelMap] could not merge the group "${group.name}" (${meshes.length} meshes)`);
      continue;
    }
    fused.name = group.name;
    scope.adopt(fused);
    merged.set(group.role, fused);
  }

  // 4. El suelo no se fusiona: se saca del root para que sobreviva a su limpieza.
  ground.computeWorldMatrix(true);
  ground.name = map.ground.name;
  scope.adopt(ground);

  // 5. Todo lo que quedó dentro del root son cáscaras vacías y mallas descartadas.
  onProgress?.(1);
  discardImported();

  return { merged, ground, droppedMeshCount };
}
EOF

write_file "game/levels/level-loader.ts" <<'EOF'
import "@babylonjs/loaders/glTF"; // registra el loader de .glb/.gltf
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader"; // deprecado desde Babylon 8: migrar a ImportMeshAsync de módulo al actualizar
import type { Scene } from "@babylonjs/core/scene";

import { TypedEventEmitter } from "../core/events/typed-event-emitter";
import type { LevelDefinition } from "./level-definition";
import { createLevelMap, type LoadedMap } from "./level-map-factory";
import type { LevelScope } from "./level-scope";

/** Qué parte de la barra ocupa la descarga; el resto es el procesamiento (fusión de mallas). */
const DOWNLOAD_PROGRESS_WEIGHT = 0.8;

export type LevelLoadPhase = "downloading" | "optimizing";

export interface LevelLoaderEventMap {
  /** `fraction` es null mientras no se puede calcular (barra indeterminada). */
  progressChanged: { phase: LevelLoadPhase; fraction: number | null };
  levelLoaded: { levelId: string; durationMs: number; mergedGroups: number; droppedMeshes: number };
}

/** Estado 3A: carga la geometría del nivel dentro de un LevelScope. */
export class LevelLoader {
  readonly events = new TypedEventEmitter<LevelLoaderEventMap>();

  constructor(private readonly scene: Scene) {}

  /** Devuelve null si el scope se liberó durante la carga (cancelada). Rechaza si algo falla. */
  async load(definition: LevelDefinition, scope: LevelScope): Promise<LoadedMap | null> {
    const startedAt = performance.now();
    const { map } = definition;

    this.events.emit("progressChanged", { phase: "downloading", fraction: null });
    const imported = await SceneLoader.ImportMeshAsync("", map.modelRootUrl, map.modelFile, this.scene, (event) => {
      if (event.lengthComputable && event.total > 0) {
        this.events.emit("progressChanged", {
          phase: "downloading",
          fraction: (event.loaded / event.total) * DOWNLOAD_PROGRESS_WEIGHT,
        });
      }
    });

    try {
      const loaded = await createLevelMap(imported.meshes, map, scope, (fraction) => {
        this.events.emit("progressChanged", {
          phase: "optimizing",
          fraction: DOWNLOAD_PROGRESS_WEIGHT + fraction * (1 - DOWNLOAD_PROGRESS_WEIGHT),
        });
      });
      if (!loaded) {
        return null;
      }
      this.events.emit("levelLoaded", {
        levelId: definition.id,
        durationMs: performance.now() - startedAt,
        mergedGroups: loaded.merged.size,
        droppedMeshes: loaded.droppedMeshCount,
      });
      return loaded;
    } finally {
      // Lo que el mapa no usa del GLB (animaciones, esqueletos, luces) no se conserva.
      imported.animationGroups.forEach((group) => group.dispose());
      imported.skeletons.forEach((skeleton) => skeleton.dispose());
      imported.lights.forEach((light) => light.dispose());
    }
  }

  dispose(): void {
    this.events.clear();
  }
}
EOF

write_file "game/levels/level-session.ts" <<'EOF'
import type { Scene } from "@babylonjs/core/scene";

import type { LevelDefinition } from "./level-definition";
import type { LoadedMap } from "./level-map-factory";
import { LevelScope } from "./level-scope";

export interface ActiveLevel {
  readonly definition: LevelDefinition;
  readonly scope: LevelScope;
  /** null hasta que termina la carga (3A). */
  map: LoadedMap | null;
}

/**
 * El nivel que está cargado ahora. Sobrevive a los estados (3A lo crea, 3B y "playing" lo usan)
 * y se libera al abrir otro nivel, al terminar o al cerrar el juego.
 */
export class LevelSession {
  private active: ActiveLevel | null = null;

  constructor(private readonly scene: Scene) {}

  get current(): ActiveLevel | null {
    return this.active;
  }

  /** Libera el nivel anterior (si hay) y abre el scope del nuevo. */
  begin(definition: LevelDefinition): LevelScope {
    this.end();
    const scope = new LevelScope(this.scene, definition.id);
    this.active = { definition, scope, map: null };
    return scope;
  }

  complete(map: LoadedMap): void {
    if (!this.active) {
      throw new Error("[LevelSession] there is no level in progress");
    }
    this.active.map = map;
  }

  end(): void {
    this.active?.scope.dispose();
    this.active = null;
  }
}
EOF

write_file "game/levels/level-viewer-factory.ts" <<'EOF'
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

import type { LevelScope } from "./level-scope";

const FALLBACK_RADIUS = 100; // si no se pudo medir el nivel
const CAMERA_ALPHA = -Math.PI / 2;
const CAMERA_BETA = Math.PI / 3;
const CAMERA_DISTANCE_FACTOR = 0.9; // distancia inicial, en múltiplos del tamaño del nivel
const MIN_Z_FACTOR = 0.001;
const MAX_Z_FACTOR = 10;
const WHEEL_DELTA_PERCENTAGE = 0.01; // el zoom con la rueda es proporcional a la distancia
const PANNING_SENSIBILITY_BASE = 1000; // se divide por el tamaño: niveles grandes se desplazan más rápido

export interface LevelViewer {
  readonly camera: ArcRotateCamera;
  readonly light: HemisphericLight;
  dispose(): void;
}

/**
 * PLACEHOLDER hasta el estado 3B: una cámara orbital y una luz para poder VER el nivel cargado.
 * Se reemplaza por la cámara del personaje. Se mide el nivel y la cámara se encuadra sola.
 */
export function createLevelViewer(scene: Scene, canvas: HTMLCanvasElement, scope: LevelScope): LevelViewer {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const mesh of scope.root.getChildMeshes(false)) {
    if (mesh.getTotalVertices() === 0) {
      continue;
    }
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    min.minimizeInPlace(box.minimumWorld);
    max.maximizeInPlace(box.maximumWorld);
  }

  const measured = Number.isFinite(min.x);
  const center = measured ? Vector3.Center(min, max) : Vector3.Zero();
  const size = measured ? max.subtract(min) : new Vector3(FALLBACK_RADIUS, FALLBACK_RADIUS, FALLBACK_RADIUS);
  const extent = Math.max(size.x, size.y, size.z);

  const camera = new ArcRotateCamera(
    "level-viewer-camera",
    CAMERA_ALPHA,
    CAMERA_BETA,
    extent * CAMERA_DISTANCE_FACTOR,
    center,
    scene,
  );
  camera.minZ = Math.max(0.01, extent * MIN_Z_FACTOR);
  camera.maxZ = extent * MAX_Z_FACTOR;
  camera.wheelDeltaPercentage = WHEEL_DELTA_PERCENTAGE;
  camera.panningSensibility = Math.max(0.01, PANNING_SENSIBILITY_BASE / extent);
  camera.attachControl(canvas, true);
  scene.activeCamera = camera;

  const light = new HemisphericLight("level-viewer-light", Vector3.Up(), scene);

  scope.register(camera);
  scope.register(light);

  return {
    camera,
    light,
    dispose: () => {
      camera.dispose();
      light.dispose();
    },
  };
}
EOF

write_file "game/screens/game-finished-screen.ts" <<'EOF'
import { HtmlScreen } from "../ui/screens/html-screen";

/** Estado 8 — créditos finales. Placeholder. */
export class GameFinishedScreen extends HtmlScreen {
  constructor() {
    super(
      "game-finished",
      "screen--game-finished",
      `
        <p class="screen__title">Game completed</p>
        <div class="screen__logo">PLACE CREDITS HERE</div>
        <p class="screen__prompt">Press any key</p>
      `,
    );
  }
}
EOF

write_file "game/states/game-finished-state.ts" <<'EOF'
import type { AnyInputService } from "../core/input/any-input-service";
import type { GameState, GameStateTransitioner } from "../fsm/game-state";
import type { LevelRepository } from "../levels/level-repository";
import { GameFinishedScreen } from "../screens/game-finished-screen";
import type { ScreenManager } from "../ui/screens/screen-manager";

/** Estado 8 — Juego completado: con press any key borra el progreso y vuelve al estado 1. */
export class GameFinishedState implements GameState {
  readonly id = "game-finished" as const;

  private readonly screen = new GameFinishedScreen();
  private cancelInputWait: (() => void) | null = null;

  constructor(
    private readonly screens: ScreenManager,
    private readonly input: AnyInputService,
    private readonly levels: LevelRepository,
    private readonly transitioner: GameStateTransitioner,
  ) {}

  enter(): void {
    this.screens.show(this.screen);
    this.cancelInputWait = this.input.onNextInput(() => {
      this.levels.reset();
      this.transitioner.transitionTo("splash").catch(console.error);
    });
  }

  exit(): void {
    this.cancelInputWait?.();
    this.cancelInputWait = null;
    this.screens.hide(this.screen);
  }
}
EOF

echo "-- archivos actualizados (solo si no los editaste)"

update_file "game/assets/asset-loader.ts" "a64411d3bcfdc2f991320e4a8f21099d2daa0972a3049739bd476db31802166d" <<'EOF'
import "@babylonjs/loaders/glTF"; // registra el loader de .glb/.gltf
import "@babylonjs/core/Animations/animatable"; // habilita reproducir AnimationGroup
import { AssetsManager } from "@babylonjs/core/Misc/assetsManager";
import type { Scene } from "@babylonjs/core/scene";

import { TypedEventEmitter } from "../core/events/typed-event-emitter";
import { gameConfig } from "../config/game-config";
import { createCharacterAnimationSet } from "./animations/character-animation-set-factory";
import type { AssetRegistry } from "./asset-registry";

const FLARE_TEXTURE_URL = "texture/flare.png";
const KEYMAP_IMAGE_URL = "images/keymap.jpg";
const CHARACTER_MODEL_ROOT_URL = "model/";
const CHARACTER_MODEL_FILE = "skater_ver15.glb";

/** Nombre del nodo raíz que el loader de glTF crea alrededor de cada GLB. */
const GLTF_ROOT_NODE_NAME = "__root__";

export interface AssetLoaderEventMap {
  progressChanged: { finishedTasks: number; totalTasks: number; fraction: number; lastTaskName: string };
  taskFailed: { taskName: string; message: string };
  loadCompleted: { durationMs: number };
}

/** Carga los assets comunes (estado 2) y los registra en el AssetRegistry. */
export class AssetLoader {
  readonly events = new TypedEventEmitter<AssetLoaderEventMap>();

  private pending: Promise<void> | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly registry: AssetRegistry,
  ) {}

  /**
   * Carga una sola vez: las llamadas siguientes (ej: al volver al splash desde el estado 8)
   * devuelven la misma promesa ya resuelta. Si falla, se puede reintentar.
   */
  loadCommonAssets(): Promise<void> {
    this.pending ??= this.runLoad().catch((error: unknown) => {
      this.pending = null;
      throw error;
    });
    return this.pending;
  }

  private runLoad(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const startedAt = performance.now();
      const failures: string[] = [];

      const manager = new AssetsManager(this.scene);
      manager.useDefaultLoadingScreen = false; // la pantalla de carga es nuestra (HTML)

      const fail = (taskName: string, message: string): void => {
        failures.push(`${taskName}: ${message}`);
        this.events.emit("taskFailed", { taskName, message });
      };

      const textureTask = manager.addTextureTask("texture-flare", FLARE_TEXTURE_URL);
      textureTask.onSuccess = (task) => {
        this.registry.registerTexture("flare", task.texture);
      };
      textureTask.onError = (task, message) => fail(task.name, message ?? "unknown error");

      const keymapTask = manager.addImageTask("image-keymap", KEYMAP_IMAGE_URL);
      keymapTask.onSuccess = (task) => {
        this.registry.registerImage("keymap", task.image);
      };
      keymapTask.onError = (task, message) => fail(task.name, message ?? "unknown error");

      const modelTask = manager.addMeshTask("model-character", "", CHARACTER_MODEL_ROOT_URL, CHARACTER_MODEL_FILE);
      modelTask.onSuccess = (task) => {
        const root = task.loadedMeshes.find((mesh) => mesh.name === GLTF_ROOT_NODE_NAME);
        if (!root) {
          fail(task.name, `the GLB has no "${GLTF_ROOT_NODE_NAME}" node`);
          return;
        }
        root.setEnabled(false); // es un prototipo: no se ve hasta que alguien lo pida
        task.loadedAnimationGroups.forEach((group) => group.stop());
        this.registry.registerMesh("character-model", root, {
          skeleton: task.loadedSkeletons[0],
          animationGroups: task.loadedAnimationGroups,
        });
      };
      modelTask.onError = (task, message) => fail(task.name, message ?? "unknown error");

      manager.onProgress = (remainingCount, totalCount, lastFinishedTask) => {
        const finishedTasks = totalCount - remainingCount;
        this.events.emit("progressChanged", {
          finishedTasks,
          totalTasks: totalCount,
          fraction: totalCount === 0 ? 1 : finishedTasks / totalCount,
          lastTaskName: lastFinishedTask.name,
        });
      };

      manager.onFinish = () => {
        if (failures.length > 0) {
          reject(new Error(`[AssetLoader] failed to load: ${failures.join("; ")}`));
          return;
        }
        try {
          this.registry.registerCharacterAnimations(
            createCharacterAnimationSet(this.registry.getAnimationGroups("character-model")),
          );
          this.normalizeCharacterScale();
        } catch (error) {
          reject(error);
          return;
        }
        this.events.emit("loadCompleted", { durationMs: performance.now() - startedAt });
        resolve();
      };

      manager.load();
    });
  }

  dispose(): void {
    this.events.clear();
  }

  /** Escala el prototipo del personaje para que mida gameConfig.player.height. */
  private normalizeCharacterScale(): void {
    const root = this.registry.getMesh("character-model");
    root.computeWorldMatrix(true);
    const { min, max } = root.getHierarchyBoundingVectors(true); // true = incluye hijos
    const modelHeight = max.y - min.y;
    if (modelHeight <= 0) {
      throw new Error("[AssetLoader] character model has zero height; cannot normalize its scale");
    }
    root.scaling.setAll(gameConfig.player.height / modelHeight);
  }
}
EOF

update_file "game/states/level-setup-state.ts" "c86619d52a92da1e525fe9b55ab992028bef61a7e6869cc861b7f157859b93cd" <<'EOF'
import type { GameContext } from "../game-context";
import type { GameState, GameStateTransitioner } from "../fsm/game-state";
import type { LevelLoader, LevelLoadPhase } from "../levels/level-loader";
import type { LevelRepository } from "../levels/level-repository";
import type { LevelSession } from "../levels/level-session";
import { createLevelViewer } from "../levels/level-viewer-factory";
import { LoadingScreen } from "../screens/loading-screen";
import type { ScreenManager } from "../ui/screens/screen-manager";

const PHASE_LABELS: Record<LevelLoadPhase, string> = {
  downloading: "Downloading map",
  optimizing: "Optimizing map",
};

/**
 * Estado 3 — Configuración de nivel.
 *  3A (hecho): elige el próximo nivel pendiente (si no hay, va al estado 8), libera el anterior,
 *      carga la geometría con progreso real y deja el nivel vivo en el LevelSession.
 *  3B (pendiente): Character, EnemiesManager, HUD y Strategy. Por ahora se muestra el nivel
 *      con una cámara placeholder.
 */
export class LevelSetupState implements GameState {
  readonly id = "level-setup" as const;

  private readonly screen = new LoadingScreen();
  private unsubscribeProgress: (() => void) | null = null;
  private exited = false;
  private loaded = false;

  constructor(
    private readonly screens: ScreenManager,
    private readonly levels: LevelRepository,
    private readonly loader: LevelLoader,
    private readonly session: LevelSession,
    private readonly transitioner: GameStateTransitioner,
  ) {}

  async enter(context: GameContext): Promise<void> {
    this.exited = false;
    this.loaded = false;

    const definition = this.levels.getNextPending();
    if (!definition) {
      this.session.end();
      this.transitioner.transitionTo("game-finished").catch(console.error);
      return;
    }

    const scope = this.session.begin(definition); // libera el nivel anterior
    this.screens.show(this.screen);
    this.screen.setProgress(null);
    this.screen.setStatus(`Preparing ${definition.id}`);
    this.unsubscribeProgress = this.loader.events.on("progressChanged", ({ phase, fraction }) => {
      this.screen.setProgress(fraction);
      this.screen.setStatus(PHASE_LABELS[phase]);
    });

    try {
      const map = await this.loader.load(definition, scope);
      if (!map || this.exited) {
        return; // cancelada: exit() ya liberó el nivel
      }
      this.session.complete(map);
    } catch (error) {
      if (!this.exited) {
        this.screen.setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
      throw error;
    } finally {
      this.unsubscribeProgress?.();
      this.unsubscribeProgress = null;
    }

    // TODO 3B: reemplazar el visor por Character + cámara del personaje + EnemiesManager + HUD + Strategy.
    createLevelViewer(context.scene, context.canvas, scope);
    this.screens.hide(this.screen);
    this.loaded = true;
  }

  exit(): void {
    this.exited = true;
    this.unsubscribeProgress?.();
    this.unsubscribeProgress = null;
    this.screens.hide(this.screen);
    if (!this.loaded) {
      this.session.end(); // carga a medias o fallida: se limpia. Si terminó, el nivel sigue vivo para 3B/playing.
    }
  }
}
EOF

update_file "game/game.ts" "87be3347d8720a9c9063cc971bd91f55442e6ec23c68f1513c6b4c66fcb3cbfb" <<'EOF'
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Scene } from "@babylonjs/core/scene";

import { AssetLoader } from "./assets/asset-loader";
import { AssetRegistry } from "./assets/asset-registry";
import { AnyInputService } from "./core/input/any-input-service";
import { createSafeStorage } from "./core/storage/safe-storage";
import { GameFsm } from "./fsm/game-fsm";
import type { GameContext } from "./game-context";
import { LEVEL_DEFINITIONS } from "./levels/level-definitions";
import { LevelLoader } from "./levels/level-loader";
import { LevelRepository } from "./levels/level-repository";
import { LevelSession } from "./levels/level-session";
import { AssetsLoadingState } from "./states/assets-loading-state";
import { GameFinishedState } from "./states/game-finished-state";
import { LevelSetupState } from "./states/level-setup-state";
import { SplashState } from "./states/splash-state";
import { ScreenManager } from "./ui/screens/screen-manager";

/** Raíz de composición del juego: arma el contexto, los servicios, la GameFsm y sus estados. */
export class Game {
  private readonly screens: ScreenManager;
  private readonly input: AnyInputService;
  private readonly assets: AssetRegistry;
  private readonly assetLoader: AssetLoader;
  private readonly levels: LevelRepository;
  private readonly levelSession: LevelSession;
  private readonly levelLoader: LevelLoader;
  private readonly fsm: GameFsm;
  private readonly debugHudReady: Promise<void>;
  private detachDebugHud?: () => void;

  constructor(scene: Scene, engine: AbstractEngine, canvas: HTMLCanvasElement) {
    const context: GameContext = { scene, engine, canvas };

    this.screens = new ScreenManager();
    this.input = new AnyInputService();
    this.assets = new AssetRegistry();
    this.assetLoader = new AssetLoader(scene, this.assets);
    this.levels = new LevelRepository(LEVEL_DEFINITIONS, createSafeStorage());
    this.levelSession = new LevelSession(scene);
    this.levelLoader = new LevelLoader(scene);
    this.fsm = new GameFsm(context);
    this.fsm.register(
      new SplashState(this.screens, this.input, this.fsm),
      new AssetsLoadingState(this.screens, this.input, this.assetLoader, this.assets, this.fsm),
      new LevelSetupState(this.screens, this.levels, this.levelLoader, this.levelSession, this.fsm),
      new GameFinishedState(this.screens, this.input, this.levels, this.fsm),
      // próximas iteraciones: PlayingState, PausedState, ...
    );

    // import.meta.env.DEV es `false` literal en el build: la rama (y el import dinámico) se eliminan.
    this.debugHudReady = import.meta.env.DEV ? this.attachDebugHud() : Promise.resolve();
  }

  async start(): Promise<void> {
    await this.debugHudReady; // evita perder los primeros eventos de la FSM
    await this.fsm.transitionTo("splash");
  }

  update(deltaTime: number): void {
    this.fsm.update(deltaTime);
  }

  dispose(): void {
    this.detachDebugHud?.();
    this.fsm.dispose();
    this.levelSession.end();
    this.levelLoader.dispose();
    this.assetLoader.dispose();
    this.assets.dispose();
    this.input.dispose();
    this.screens.dispose();
  }

  private async attachDebugHud(): Promise<void> {
    const { attachGameDebugHud } = await import("./debug/attach-game-debug-hud");
    this.detachDebugHud = attachGameDebugHud(this.fsm.events);
  }
}
EOF

setup_end