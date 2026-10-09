import "@babylonjs/loaders/glTF"; // registra el loader de .glb/.gltf
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import { TypedEventEmitter } from "../core/events/typed-event-emitter";
import type { GlbMapSource, LevelDefinition, MapMeshRole } from "./level-definition";
import { createGlbMap, type LoadedGlbMap, type LoadedMap } from "./level-map-factory";
import type { LevelScope } from "./level-scope";
import { createProceduralMap } from "./procedural-map-factory";

/** Qué parte de la barra ocupa la descarga; el resto es el procesamiento (fusión de mallas). */
const DOWNLOAD_PROGRESS_WEIGHT = 0.8;

export type LevelLoadPhase = "downloading" | "optimizing" | "building";

/** Informa el avance de UNA fuente (0 a 1, o null si no se puede calcular). */
type SourceProgressReporter = (phase: LevelLoadPhase, fraction: number | null) => void;

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
  /**
   * Procesa en orden todas las fuentes de mapa del nivel; cada una ocupa una porción igual de la barra.
   * Devuelve null si el scope se liberó durante la carga (cancelada). Rechaza si algo falla
   * o si ninguna fuente aporta un suelo.
   */
  async load(definition: LevelDefinition, scope: LevelScope): Promise<LoadedMap | null> {
    const startedAt = performance.now();
    const { maps } = definition;

    const merged = new Map<MapMeshRole, Mesh>();
    const grounds: Mesh[] = [];
    const proceduralMeshes: Mesh[] = [];
    let droppedMeshCount = 0;

    for (let index = 0; index < maps.length; index++) {
      const source = maps[index];
      const report: SourceProgressReporter = (phase, fraction) => {
        this.events.emit("progressChanged", {
          phase,
          fraction: fraction === null ? null : (index + fraction) / maps.length,
        });
      };

      if (source.kind === "glb") {
        const loaded = await this.loadGlb(source, scope, report);
        if (!loaded) {
          return null;
        }
        loaded.merged.forEach((mesh, role) => {
          if (merged.has(role)) {
            console.warn(`[LevelLoader] the role "${role}" is defined by more than one map of "${definition.id}"`);
          }
          merged.set(role, mesh);
        });
        grounds.push(loaded.ground);
        droppedMeshCount += loaded.droppedMeshCount;
      } else {
        report("building", 0);
        const built = createProceduralMap(source, this.scene, scope);
        if (!built) {
          return null;
        }
        if (built.ground) {
          grounds.push(built.ground);
        }
        proceduralMeshes.push(...built.meshes);
        report("building", 1);
      }
    }

    if (grounds.length === 0) {
      throw new Error(`[LevelLoader] the level "${definition.id}" has no ground in any of its maps`);
    }

    this.events.emit("levelLoaded", {
      levelId: definition.id,
      durationMs: performance.now() - startedAt,
      mergedGroups: merged.size,
      droppedMeshes: droppedMeshCount,
    });
    return { merged, ground: grounds[0], grounds, proceduralMeshes, droppedMeshCount };
  }

  private async loadGlb(
    source: GlbMapSource,
    scope: LevelScope,
    report: SourceProgressReporter,
  ): Promise<LoadedGlbMap | null> {
    report("downloading", null);
    const imported = await SceneLoader.ImportMeshAsync("", source.modelRootUrl, source.modelFile, this.scene, (event) => {
      if (event.lengthComputable && event.total > 0) {
        report("downloading", (event.loaded / event.total) * DOWNLOAD_PROGRESS_WEIGHT);
      }
    });

    try {
      return await createGlbMap(imported.meshes, source, scope, (fraction) => {
        report("optimizing", DOWNLOAD_PROGRESS_WEIGHT + fraction * (1 - DOWNLOAD_PROGRESS_WEIGHT));
      });
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
