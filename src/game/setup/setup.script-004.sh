#!/usr/bin/env bash
# setup.script-004 — ControlsScreen con la imagen del keymap + pantallas responsivas.
# Ejecutar parado en /src:   bash game/setup/setup.script-004.sh
#
# Qué hace:
#   - El AssetLoader precarga public/images/keymap.jpg (con progreso y errores) y la guarda
#     en el AssetRegistry (ImageAssetKey "keymap"; getImage).
#   - ControlsScreen recibe esa imagen ya descargada (sin parpadeo ni URL duplicada).
#   - CSS responsivo: la imagen se ajusta al ancho/alto disponible, el overlay se desplaza si
#     el contenido no entra, y en celulares en horizontal se oculta el título.
#   - Actualiza 7 archivos entregados por 002/003 SOLO si no los editaste (si no, deja <archivo>.new).
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
setup_requires "setup.script-003.sh"

echo "-- archivos actualizados (solo si no los editaste)"

update_file "game/assets/asset-keys.ts" "1e55174f7fe562322b1f6c707d3fbb8915b7049b3e25f09fac6545d55f31c568" <<'EOF'
/** Claves de los assets comunes: kebab-case, en inglés. */
export type TextureAssetKey = "flare";
export type ImageAssetKey = "keymap";
export type MeshAssetKey = "character-model";
EOF

update_file "game/assets/asset-loader.ts" "f5e5c9ad283271057fb4765d10c0eace0eb106dc4cfdc6f505411202ca2d93c9" <<'EOF'
import "@babylonjs/loaders/glTF"; // registra el loader de .glb/.gltf
import "@babylonjs/core/Animations/animatable"; // habilita reproducir AnimationGroup
import { AssetsManager } from "@babylonjs/core/Misc/assetsManager";
import type { Scene } from "@babylonjs/core/scene";

import { TypedEventEmitter } from "../core/events/typed-event-emitter";
import { gameConfig } from "../config/game-config";
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

update_file "game/assets/asset-registry.ts" "fe859572e31e4a24491877652fa2aaac2b196c8b39fc64f0ecf7599eab543ebd" <<'EOF'
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import type { ImageAssetKey, MeshAssetKey, TextureAssetKey } from "./asset-keys";

export interface MeshAssetExtras {
  skeleton?: Skeleton;
  /** Clips crudos del GLB, tal cual vienen (parados). */
  animationGroups?: readonly AnimationGroup[];
}

/** Guarda los prototipos de los assets por clave y los entrega (compartidos o clonados). */
export class AssetRegistry {
  private readonly textures = new Map<TextureAssetKey, Texture>();
  private readonly images = new Map<ImageAssetKey, HTMLImageElement>();
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

  registerImage(key: ImageAssetKey, image: HTMLImageElement): void {
    this.images.set(key, image);
  }

  getTexture(key: TextureAssetKey): Texture {
    return this.require(this.textures.get(key), "texture", key);
  }

  /** Imagen ya descargada y decodificable: lista para usar en pantallas HTML. */
  getImage(key: ImageAssetKey): HTMLImageElement {
    return this.require(this.images.get(key), "image", key);
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
    this.images.clear();
  }

  private require<T>(value: T | undefined, kind: string, key: string): T {
    if (value === undefined) {
      throw new Error(`[AssetRegistry] ${kind} "${key}" is not registered (was it loaded?)`);
    }
    return value;
  }
}
EOF

update_file "game/game.ts" "0f84fa45a9cfcff39dfe1318090166ad20c3c1042b70a17796b161d48f380ca2" <<'EOF'
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
      new AssetsLoadingState(this.screens, this.input, this.assetLoader, this.assets, this.fsm),
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

update_file "game/screens/controls-screen.ts" "71d5dc1e477d0fbed5b9ddb0d32b220446ed914fab92c4ed41d929d658b99f6c" <<'EOF'
import { HtmlScreen } from "../ui/screens/html-screen";

/**
 * Estado 2b — overlay con el mapeo de teclas.
 * Recibe la imagen ya descargada por el AssetLoader, así no hay parpadeo ni URL duplicada.
 */
export class ControlsScreen extends HtmlScreen {
  constructor(keymapImage: HTMLImageElement) {
    super(
      "controls",
      "screen--controls",
      `
        <p class="screen__title">Controls</p>
        <div class="screen__keymap-slot"></div>
        <p class="screen__prompt">Press any key to continue</p>
      `,
    );
    const slot = this.element.querySelector(".screen__keymap-slot");
    if (!slot) {
      throw new Error("[ControlsScreen] the template is missing the keymap slot");
    }
    keymapImage.className = "screen__keymap";
    keymapImage.alt = "Keyboard and mouse controls";
    keymapImage.decoding = "async";
    slot.replaceWith(keymapImage);
  }
}
EOF

update_file "game/states/assets-loading-state.ts" "ec1f7e9a7009bd0f25a95a056a3fa74f514f161497d405499523b1a234d04c61" <<'EOF'
import type { AssetLoader } from "../assets/asset-loader";
import type { AssetRegistry } from "../assets/asset-registry";
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
  private controlsScreen: ControlsScreen | null = null; // se crea tras la carga: usa la imagen ya descargada
  private cancelInputWait: (() => void) | null = null;
  private unsubscribeProgress: (() => void) | null = null;
  private exited = false;

  constructor(
    private readonly screens: ScreenManager,
    private readonly input: AnyInputService,
    private readonly loader: AssetLoader,
    private readonly assets: AssetRegistry,
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

    this.controlsScreen ??= new ControlsScreen(this.assets.getImage("keymap"));
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
    if (this.controlsScreen) {
      this.screens.hide(this.controlsScreen);
    }
  }
}
EOF

update_file "game/ui/screens/screens.css" "b9b0292a659cb0eb39c3e18fb9df10ce9b8c2e2a285be007047a648f02217e79" <<'EOF'
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

/* Si el contenido no entra en pantalla (celulares chicos, landscape), la pantalla se desplaza. */
.screen-root {
  overflow-y: auto;
}

.screen__keymap {
  display: block;
  width: auto;
  height: auto;
  max-width: min(92vw, 64rem);
  max-height: 58dvh;
  object-fit: contain;
  border-radius: 0.75rem;
  box-shadow: 0 0 2rem color-mix(in srgb, var(--screen-accent) 25%, transparent);
}

/* Celulares en horizontal: se oculta el título para darle el alto a la imagen. */
@media (orientation: landscape) and (max-height: 32rem) {
  .screen--controls {
    gap: 0.75rem;
  }

  .screen--controls .screen__title {
    display: none;
  }

  .screen__keymap {
    max-height: 62dvh;
  }
}
EOF

setup_end