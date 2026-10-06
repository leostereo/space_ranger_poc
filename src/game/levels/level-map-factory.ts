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
