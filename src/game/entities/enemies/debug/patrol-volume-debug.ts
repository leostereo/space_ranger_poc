import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import type { PatrolVolume } from "../../../navigation/patrol-region";

const DEBUG_COLOR = new Color3(0.1, 1, 0.4);
const SPHERE_SEGMENTS = 16;

export interface PatrolVolumeDebug {
  /** Idempotente. */
  dispose(): void;
}

/**
 * Dibuja el volumen de patrulla como malla wireframe. Solo existe en DEV: en producción devuelve null.
 * No es pickable, así que no frena los proyectiles ni estorba al raycast de suelo.
 */
export function createPatrolVolumeDebug(scene: Scene, id: string, volume: PatrolVolume): PatrolVolumeDebug | null {
  if (!import.meta.env.DEV) {
    return null;
  }

  const name = `debug:${id}:patrol-volume`;
  const mesh: Mesh =
    volume.kind === "box"
      ? CreateBox(name, { width: volume.size.x, height: volume.size.y, depth: volume.size.z }, scene)
      : CreateSphere(name, { diameter: volume.radius * 2, segments: SPHERE_SEGMENTS }, scene);
  mesh.position.copyFrom(volume.center);
  mesh.isPickable = false;

  const material = new StandardMaterial(`${name}:material`, scene);
  material.wireframe = true;
  material.disableLighting = true;
  material.emissiveColor = DEBUG_COLOR;
  mesh.material = material;

  let disposed = false;
  return {
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      mesh.dispose(false, true); // el material es propio: se libera con la malla
    },
  };
}