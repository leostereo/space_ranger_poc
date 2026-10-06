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
