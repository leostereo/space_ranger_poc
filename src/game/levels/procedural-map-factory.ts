import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import type { ProceduralMapSource, StaticShape, StaticSolid } from "./level-definition";
import type { LevelScope } from "./level-scope";

export interface LoadedProceduralMap {
  readonly meshes: readonly Mesh[];
  readonly ground: Mesh | null;
  readonly groundShape: StaticShape;
  readonly solids: readonly StaticSolid[];
}

/**
 * Ejecuta la construcción de una fuente procedural y deja todo lo que creó adoptado por `scope`.
 * Devuelve null si el scope ya se liberó (carga cancelada): en ese caso no construye nada.
 */
export function createProceduralMap(
  source: ProceduralMapSource,
  scene: Scene,
  scope: LevelScope,
): LoadedProceduralMap | null {
  if (scope.isDisposed) {
    return null;
  }

  const { ground = null, groundShape = "box", meshes = [], solids = [] } = source.build({ scene, scope });
  if (ground) {
    scope.adopt(ground);
  }
  meshes.forEach((mesh) => scope.adopt(mesh));
  solids.forEach((solid) => scope.adopt(solid.mesh));

  return { meshes, ground, groundShape, solids };
}