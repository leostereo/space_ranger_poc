import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import type { ProceduralMapSource } from "./level-definition";
import type { LevelScope } from "./level-scope";

export interface LoadedProceduralMap {
  readonly meshes: readonly Mesh[];
  readonly ground: Mesh | null;
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

  const { ground = null, meshes = [] } = source.build({ scene, scope });
  if (ground) {
    scope.adopt(ground);
  }
  meshes.forEach((mesh) => scope.adopt(mesh));

  return { meshes, ground };
}