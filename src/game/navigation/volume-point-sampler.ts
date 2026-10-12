import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { NavigationService } from "./navigation-service";
import { planeHeightAt, randomPointInVolume, volumeContains, type PatrolRegion } from "./patrol-region";

const MAX_ATTEMPTS = 16;

/**
 * Implementación sin navmesh: sortea directo dentro del volumen. Sirve hasta que haya un navmesh real
 * detrás de la misma interfaz. Necesita un volumen: sin él no tiene límites donde sortear.
 */
export class VolumePointSampler implements NavigationService {
  getRandomPoint(region: PatrolRegion, out: Vector3 = new Vector3()): Vector3 | null {
    const { volume, plane } = region;
    if (!volume) {
      console.warn("[VolumePointSampler] the region has no volume: there are no bounds to sample from");
      return null;
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      randomPointInVolume(volume, out);
      if (plane) {
        out.y = planeHeightAt(plane, out.x, out.z);
        if (!volumeContains(volume, out)) {
          continue; // el plano queda fuera del volumen en ese (x, z)
        }
      }
      return out;
    }
    return null;
  }

  dispose(): void {
    // Sin recursos.
  }
}