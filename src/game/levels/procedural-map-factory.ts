import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import type { AssetRegistry } from "../assets/asset-registry"; // Ajustar ruta relativa si hace falta
import type { ProceduralMapSource, StaticShape, StaticSolid } from "./level-definition";
import type { LevelScope } from "./level-scope";
import type { ManagedUnitInstance } from "./unit-builder.types";

export interface LoadedProceduralMap {
  readonly meshes: readonly Mesh[];
  readonly ground: Mesh | null;
  readonly groundShape: StaticShape;
  readonly solids: readonly StaticSolid[];
  readonly managedUnits?: readonly ManagedUnitInstance[]; 
}

export function createProceduralMap(
  source: ProceduralMapSource,
  scene: Scene,
  scope: LevelScope,
  registry: AssetRegistry,
): LoadedProceduralMap | null {
  if (scope.isDisposed) {
    return null;
  }

  const { 
    ground = null, 
    groundShape = "box", 
    meshes = [], 
    solids = [],
    managedUnits = []
  } = source.build({ scene, scope, registry });
  
  if (ground) {
    scope.adopt(ground);
  }
  meshes.forEach((mesh) => scope.adopt(mesh));
  solids.forEach((solid) => scope.adopt(solid.mesh));

  return { meshes, ground, groundShape, solids, managedUnits };
}
