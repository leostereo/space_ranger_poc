#!/usr/bin/env bash
# setup.script-003 — Assets comunes y estado 2 (carga con progreso + controles).
# Ejecutar parado en /src:   bash game/setup/setup.script-003.sh
#
# Qué hace:
#   - game/config/game-config.ts : config COMPARTIDA (solo player.height por ahora).
#     Regla: los valores de comportamiento van como constantes en la clase que los usa.
#   - game/assets/ : AssetLoader (carga con progreso/errores y eventos) + AssetRegistry
#     (prototipos por clave; getMesh(key, clone = false, prefix = "")).
#   - Estado 2 real: 2a barra de progreso, 2b pantalla de controles + press any key.
#   - LevelSetupState placeholder, para que la cadena de transiciones no termine en error.
#   - Actualiza 4 archivos entregados por 002 SOLO si no los editaste (si no, deja <archivo>.new).
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

# Extiende _lib.sh con update_file (una sola vez, idempotente)
if ! grep -q '^update_file()' "$BOOT_DIR/_lib.sh"; then
  cat >> "$BOOT_DIR/_lib.sh" <<'LIB'

# ---- agregado por setup.script-003 ----
file_hash() { # sha256 del archivo ignorando saltos de línea CRLF
  if command -v sha256sum > /dev/null 2>&1; then
    tr -d '\r' < "$1" | sha256sum | cut -d' ' -f1
  else
    tr -d '\r' < "$1" | shasum -a 256 | cut -d' ' -f1
  fi
}

# Actualiza un archivo entregado por una migración anterior.
#   - no existe                    -> CREATE
#   - ya es igual al nuevo         -> SAME
#   - es igual a la versión previa -> UPDATE (nadie lo editó: se reemplaza)
#   - distinto (lo editaste)       -> CONFLICT: deja <path>.new
update_file() { # $1 = ruta, $2 = sha256 de la versión previa entregada
  local path="$1" previous_sha="$2" tmp
  tmp="$(mktemp)"
  cat > "$tmp"
  chmod 644 "$tmp"
  if [[ ! -e "$path" ]]; then
    mkdir -p "$(dirname "$path")"
    mv "$tmp" "$path"
    echo "CREATE   $path"
  elif diff -q <(tr -d '\r' < "$path") <(tr -d '\r' < "$tmp") > /dev/null; then
    rm -f "$tmp"
    echo "SAME     $path"
  elif [[ "$(file_hash "$path")" == "$previous_sha" ]]; then
    mv "$tmp" "$path"
    echo "UPDATE   $path"
  else
    mv "$tmp" "$path.new"
    SETUP_CONFLICTS=$((SETUP_CONFLICTS + 1))
    echo "CONFLICT $path (lo editaste; versión nueva en $path.new)"
  fi
}
LIB
fi

# shellcheck source=_lib.sh
source "$BOOT_DIR/_lib.sh"

setup_begin "$0"
setup_requires "setup.script-002.sh"

echo "-- archivos nuevos"

write_file "game/config/game-config.ts" <<'EOF'
/**
 * Valores COMPARTIDOS: se usan en más de un lugar o sirven de base para escalar otros
 * (ej: ENEMY_HEIGHT = gameConfig.player.height * 1.2).
 *
 * Los valores de comportamiento propios de una clase NO van acá: se declaran como
 * constantes al inicio del archivo que los usa (const WALKING_SPEED = 1.4;).
 */
export const gameConfig = {
  player: {
    // El modelo del personaje se escala a esta altura; de acá derivan cápsula, enemigos, etc.
    // (el POC tenía 1.8 comentado y 0.8 activo)
    height: 0.8,
  },
} as const;
EOF

write_file "game/assets/asset-keys.ts" <<'EOF'
/** Claves de los assets comunes: kebab-case, en inglés. */
export type TextureAssetKey = "flare";
export type MeshAssetKey = "character-model";
EOF

write_file "game/assets/asset-registry.ts" <<'EOF'
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import type { MeshAssetKey, TextureAssetKey } from "./asset-keys";

export interface MeshAssetExtras {
  skeleton?: Skeleton;
  /** Clips crudos del GLB, tal cual vienen (parados). */
  animationGroups?: readonly AnimationGroup[];
}

/** Guarda los prototipos de los assets por clave y los entrega (compartidos o clonados). */
export class AssetRegistry {
  private readonly textures = new Map<TextureAssetKey, Texture>();
  private readonly meshes = new Map<MeshAssetKey, AbstractMesh>();
  private readonly skeletons = new Map<MeshAssetKey, Skeleton>();
  private readonly animationGroups = new Map<MeshAssetKey, readonly AnimationGroup[]>();

  registerTexture(key: TextureAssetKey, texture: Texture): void {
    this.textures.set(key, texture);
  }

  registerMesh(key: MeshAssetKey, mesh: AbstractMesh, extras: MeshAssetExtras = {}): void {
    this.meshes.set(key, mesh);
    if (extras.skeleton) {
      this.skeletons.set(key, extras.skeleton);
    }
    if (extras.animationGroups) {
      this.animationGroups.set(key, extras.animationGroups);
    }
  }

  getTexture(key: TextureAssetKey): Texture {
    return this.require(this.textures.get(key), "texture", key);
  }

  /**
   * Por defecto NO clona: devuelve el prototipo compartido, sin efectos secundarios
   * (sigue deshabilitado; quien lo use directamente decide cuándo habilitarlo).
   *
   * Con `clone = true` devuelve una copia habilitada cuyo nombre es `${prefix}${nombre original}`.
   * Quien la pide es dueño de la copia y debe llamar a su dispose().
   */
  getMesh(key: MeshAssetKey, clone = false, prefix = ""): AbstractMesh {
    const prototype = this.require(this.meshes.get(key), "mesh", key);
    if (!clone) {
      return prototype;
    }
    const instance = prototype.clone(`${prefix}${prototype.name}`, null);
    if (!instance) {
      throw new Error(`[AssetRegistry] could not clone mesh "${key}"`);
    }
    instance.setEnabled(true);
    return instance;
  }

  getSkeleton(key: MeshAssetKey): Skeleton | undefined {
    return this.skeletons.get(key);
  }

  /** Clips crudos compartidos del GLB (no clonados). */
  getAnimationGroups(key: MeshAssetKey): readonly AnimationGroup[] {
    return this.animationGroups.get(key) ?? [];
  }

  dispose(): void {
    this.animationGroups.forEach((groups) => groups.forEach((group) => group.dispose()));
    this.skeletons.forEach((skeleton) => skeleton.dispose());
    this.meshes.forEach((mesh) => mesh.dispose(false, true));
    this.textures.forEach((texture) => texture.dispose());
    this.animationGroups.clear();
    this.skeletons.clear();
    this.meshes.clear();
    this.textures.clear();
  }

  private require<T>(value: T | undefined, kind: string, key: string): T {
    if (value === undefined) {
      throw new Error(`[AssetRegistry] ${kind} "${key}" is not registered (was it loaded?)`);
    }
    return value;
  }
}
EOF

write_file "game/assets/asset-loader.ts" <<'EOF'
import "@babylonjs/loaders/glTF"; // registra el loader de .glb/.gltf
import "@babylonjs/core/Animations/animatable"; // habilita reproducir AnimationGroup
import { AssetsManager } from "@babylonjs/core/Misc/assetsManager";
import type { Scene } from "@babylonjs/core/scene";

import { TypedEventEmitter } from "../core/events/typed-event-emitter";
import { gameConfig } from "../config/game-config";
import type { AssetRegistry } from "./asset-registry";

const FLARE_TEXTURE_URL = "texture/flare.png";
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

  constructor(
    private readonly scene: Scene,
    private readonly registry: AssetRegistry,
  ) {}

  loadCommonAssets(): Promise<void> {
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

write_file "game/screens/controls-screen.ts" <<'EOF'
import { HtmlScreen } from "../ui/screens/html-screen";

/** Estado 2b — overlay con el mapeo de teclas. Placeholder. */
export class ControlsScreen extends HtmlScreen {
  constructor() {
    super(
      "controls",
      "screen--controls",
      `
        <p class="screen__title">Controls</p>
        <div class="screen__logo">PLACE KEY MAP HERE</div>
        <p class="screen__prompt">Press any key to continue</p>
      `,
    );
  }
}
EOF

write_file "game/states/level-setup-state.ts" <<'EOF'
import type { GameState } from "../fsm/game-state";
import { LoadingScreen } from "../screens/loading-screen";
import type { ScreenManager } from "../ui/screens/screen-manager";

/** Estado 3 — Configuración de nivel (3A + 3B). Placeholder hasta tener LevelRepository y LevelFactory. */
export class LevelSetupState implements GameState {
  readonly id = "level-setup" as const;

  private readonly screen = new LoadingScreen();

  constructor(private readonly screens: ScreenManager) {}

  enter(): void {
    this.screens.show(this.screen);
    this.screen.setStatus("Level setup: not implemented yet");
  }

  exit(): void {
    this.screens.hide(this.screen);
  }
}
EOF

echo "-- archivos actualizados (solo si no los editaste)"

update_file "game/game.ts" "1ce9ef48af311ac4fd4301395924b7546bfd36e78e2ace7fac770dc93fe4ab94" <<'EOF'
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Scene } from "@babylonjs/core/scene";

import { AssetLoader } from "./assets/asset-loader";
import { AssetRegistry } from "./assets/asset-registry";
import { AnyInputService } from "./core/input/any-input-service";
import { GameFsm } from "./fsm/game-fsm";
import type { GameContext } from "./game-context";
import { AssetsLoadingState } from "./states/assets-loading-state";
import { LevelSetupState } from "./states/level-setup-state";
import { SplashState } from "./states/splash-state";
import { ScreenManager } from "./ui/screens/screen-manager";

/** Raíz de composición del juego: arma el contexto, los servicios, la GameFsm y sus estados. */
export class Game {
  private readonly screens: ScreenManager;
  private readonly input: AnyInputService;
  private readonly assets: AssetRegistry;
  private readonly assetLoader: AssetLoader;
  private readonly fsm: GameFsm;
  private readonly debugHudReady: Promise<void>;
  private detachDebugHud?: () => void;

  constructor(scene: Scene, engine: AbstractEngine, canvas: HTMLCanvasElement) {
    const context: GameContext = { scene, engine, canvas };

    this.screens = new ScreenManager();
    this.input = new AnyInputService();
    this.assets = new AssetRegistry();
    this.assetLoader = new AssetLoader(scene, this.assets);
    this.fsm = new GameFsm(context);
    this.fsm.register(
      new SplashState(this.screens, this.input, this.fsm),
      new AssetsLoadingState(this.screens, this.input, this.assetLoader, this.fsm),
      new LevelSetupState(this.screens),
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

update_file "game/states/assets-loading-state.ts" "17fe32309befe319f1304f98a1791ee2341ec3be4ca52b5d5496491520a7b850" <<'EOF'
import type { AssetLoader } from "../assets/asset-loader";
import type { AnyInputService } from "../core/input/any-input-service";
import type { GameState, GameStateTransitioner } from "../fsm/game-state";
import { ControlsScreen } from "../screens/controls-screen";
import { LoadingScreen } from "../screens/loading-screen";
import type { ScreenManager } from "../ui/screens/screen-manager";

/**
 * Estado 2 — Carga de assets comunes.
 *  2a: carga con barra de progreso real (enter() espera a que termine, por eso el
 *      evento stateEntered de la FSM refleja el tiempo de carga).
 *  2b: overlay de controles; con press any key pasa a "level-setup".
 */
export class AssetsLoadingState implements GameState {
  readonly id = "assets-loading" as const;

  private readonly loadingScreen = new LoadingScreen();
  private readonly controlsScreen = new ControlsScreen();
  private cancelInputWait: (() => void) | null = null;
  private unsubscribeProgress: (() => void) | null = null;
  private exited = false;

  constructor(
    private readonly screens: ScreenManager,
    private readonly input: AnyInputService,
    private readonly loader: AssetLoader,
    private readonly transitioner: GameStateTransitioner,
  ) {}

  async enter(): Promise<void> {
    this.exited = false;
    this.screens.show(this.loadingScreen);
    this.loadingScreen.setProgress(0);
    this.loadingScreen.setStatus("");
    this.unsubscribeProgress = this.loader.events.on("progressChanged", ({ fraction }) => {
      this.loadingScreen.setProgress(fraction);
    });

    try {
      await this.loader.loadCommonAssets();
    } catch (error) {
      if (!this.exited) {
        this.loadingScreen.setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
      throw error;
    } finally {
      this.unsubscribeProgress?.();
      this.unsubscribeProgress = null;
    }

    if (this.exited) {
      return; // otra transición lo superó mientras cargaba
    }

    this.screens.show(this.controlsScreen);
    this.cancelInputWait = this.input.onNextInput(() => {
      this.transitioner.transitionTo("level-setup").catch(console.error);
    });
  }

  exit(): void {
    this.exited = true;
    this.unsubscribeProgress?.();
    this.unsubscribeProgress = null;
    this.cancelInputWait?.();
    this.cancelInputWait = null;
    this.screens.hide(this.loadingScreen);
    this.screens.hide(this.controlsScreen);
  }
}
EOF

update_file "game/screens/loading-screen.ts" "2f9e54da6d4bab05fa38366c16d322c885f66cafd6eaab723e61291a21b84de8" <<'EOF'
import { HtmlScreen } from "../ui/screens/html-screen";

export class LoadingScreen extends HtmlScreen {
  private readonly progress: HTMLElement;
  private readonly status: HTMLElement;

  constructor() {
    super(
      "loading",
      "screen--loading",
      `
        <p class="screen__title">Loading</p>
        <div class="screen__progress"><div class="screen__progress-bar"></div></div>
        <p class="screen__status" role="status"></p>
      `,
    );
    const progress = this.element.querySelector<HTMLElement>(".screen__progress");
    const status = this.element.querySelector<HTMLElement>(".screen__status");
    if (!progress || !status) {
      throw new Error("[LoadingScreen] the template is missing elements");
    }
    this.progress = progress;
    this.status = status;
  }

  /** `fraction` entre 0 y 1; `null` vuelve a la barra indeterminada. */
  setProgress(fraction: number | null): void {
    if (fraction === null) {
      this.progress.classList.remove("screen__progress--determinate");
      this.progress.style.removeProperty("--progress");
      return;
    }
    const clamped = Math.min(1, Math.max(0, fraction));
    this.progress.classList.add("screen__progress--determinate");
    this.progress.style.setProperty("--progress", String(clamped));
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }
}
EOF

update_file "game/ui/screens/screens.css" "56c9e2b3390c1c12181bb2d3ee2504f6bef7c6b66ebcdd143b6a3c8e65137580" <<'EOF'
.screen-root {
  --screen-bg: #05070d;
  --screen-fg: #e8f1ff;
  --screen-accent: #5cc8ff;
  --screen-gap: clamp(1.5rem, 6vh, 4rem);

  position: fixed;
  inset: 0;
  z-index: 100; /* debajo del DebugHud (1000) */
  display: flex;
}

.screen-root[hidden] {
  display: none;
}

.screen {
  flex: 1;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--screen-gap);
  padding:
    max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
    max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
  box-sizing: border-box;
  background: radial-gradient(ellipse at center, #0d1626 0%, var(--screen-bg) 70%);
  color: var(--screen-fg);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  text-align: center;
  user-select: none;
}

.screen__logo {
  width: min(70vw, 32rem);
  aspect-ratio: 16 / 9;
  display: grid;
  place-items: center;
  border: 2px dashed color-mix(in srgb, var(--screen-fg) 50%, transparent);
  border-radius: 0.75rem;
  font-size: clamp(1.25rem, 4vw, 2.5rem);
  font-weight: 700;
  letter-spacing: 0.15em;
}

.screen__title {
  margin: 0;
  font-size: clamp(1.25rem, 4vw, 2rem);
  letter-spacing: 0.25em;
  text-transform: uppercase;
}

.screen__prompt {
  margin: 0;
  font-size: clamp(0.9rem, 2.5vw, 1.25rem);
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--screen-accent);
  animation: screen-blink 1.4s ease-in-out infinite;
}

.screen__progress {
  width: min(70vw, 28rem);
  height: 0.5rem;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--screen-fg) 15%, transparent);
}

.screen__progress-bar {
  width: 40%;
  height: 100%;
  border-radius: inherit;
  background: var(--screen-accent);
  animation: screen-indeterminate 1.2s ease-in-out infinite;
}

@keyframes screen-blink {
  50% {
    opacity: 0.25;
  }
}

@keyframes screen-indeterminate {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(250%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .screen__prompt,
  .screen__progress-bar {
    animation: none;
  }
}

.screen__status {
  min-height: 1.5em;
  margin: 0;
  font-size: clamp(0.8rem, 2vw, 1rem);
  letter-spacing: 0.1em;
  opacity: 0.8;
}

.screen__progress--determinate .screen__progress-bar {
  width: calc(var(--progress, 0) * 100%);
  transform: none;
  animation: none;
  transition: width 0.2s ease-out;
}
EOF

# game/config ya tiene un archivo real: el .gitkeep de 002 sobra
rm -f game/config/.gitkeep

setup_end