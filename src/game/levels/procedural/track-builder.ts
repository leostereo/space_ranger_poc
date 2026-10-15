import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateRibbon } from "@babylonjs/core/Meshes/Builders/ribbonBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

export interface TrackOptions {
  /** Mitad del ancho del camino (m). */
  readonly halfWidth: number;
  /** Espesor del camino (m): con grosor, el cuerpo físico no se atraviesa a velocidad. */
  readonly thickness: number;
}

const MIN_HORIZONTAL_TANGENT_SQUARED = 1e-8;

/**
 * Camino con la sección SIEMPRE horizontal (sin inclinación lateral) por más que la curva suba, baje o gire.
 * `path` son los puntos del centro de la superficie superior; el espesor va hacia abajo.
 * Es un prisma cerrado de una sola cara por triángulo, con las normales hacia afuera.
 */
export function createTrackMesh(scene: Scene, name: string, path: readonly Vector3[], options: TrackOptions): Mesh {
  if (path.length < 2) {
    throw new Error("[createTrackMesh] the path needs at least 2 points");
  }
  const { halfWidth, thickness } = options;

  const topLeft: Vector3[] = [];
  const topRight: Vector3[] = [];
  const bottomRight: Vector3[] = [];
  const bottomLeft: Vector3[] = [];

  let right = new Vector3(1, 0, 0);
  for (let index = 0; index < path.length; index++) {
    const before = path[Math.max(index - 1, 0)];
    const after = path[Math.min(index + 1, path.length - 1)];
    const tangent = after.subtract(before);

    // Derecha horizontal = Up × tangente = (t.z, 0, -t.x). Si la tangente es vertical, conserva la anterior.
    if (tangent.x * tangent.x + tangent.z * tangent.z > MIN_HORIZONTAL_TANGENT_SQUARED) {
      right = new Vector3(tangent.z, 0, -tangent.x).normalize();
    }

    const lateral = right.scale(halfWidth);
    const left = path[index].subtract(lateral);
    const rightEdge = path[index].add(lateral);
    topLeft.push(left);
    topRight.push(rightEdge);
    bottomRight.push(rightEdge.subtractFromFloats(0, thickness, 0));
    bottomLeft.push(left.subtractFromFloats(0, thickness, 0));
  }

  const track = CreateRibbon(
    name,
    { pathArray: [topLeft, topRight, bottomRight, bottomLeft], closeArray: true, updatable: false },
    scene,
  );

  // El primer vértice es topLeft[0]: su normal tiene que mirar hacia arriba. Si no, se invierte todo el prisma.
  const normals = track.getVerticesData(VertexBuffer.NormalKind);
  if (normals && normals[1] < 0) {
    track.flipFaces(true);
  }
  return track;
}