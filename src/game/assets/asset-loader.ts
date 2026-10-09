import "@babylonjs/loaders/glTF"; // registra el loader de .glb/.gltf
import "@babylonjs/core/Animations/animatable"; // habilita reproducir AnimationGroup
import { AssetsManager } from "@babylonjs/core/Misc/assetsManager";
import type { Scene } from "@babylonjs/core/scene";

import { TypedEventEmitter } from "../core/events/typed-event-emitter";
import { gameConfig } from "../config/game-config";
import { createCharacterAnimationSet } from "./animations/character-animation-set-factory";
import { createBoardMaterial } from "./materials/board-material-factory";
import { createDummyTargetMaterial } from "./materials/dummy-target-material-factory";

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
          this.registry.registerMaterial("board", createBoardMaterial(this.scene));
          this.registry.registerMaterial("dummy-target", createDummyTargetMaterial(this.scene));
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
