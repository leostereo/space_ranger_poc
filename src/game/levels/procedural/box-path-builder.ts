import type { Material } from "@babylonjs/core/Materials/material";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import type { SolidKind } from "../level-definition";

export interface BoxPathMaterials {
  readonly normal: Material;
  readonly breakable: Material;
  readonly falling: Material;
}

export interface BoxPathOptions {
  /** Mitad del ancho del piso (m). */
  readonly halfWidth: number;
  /** Espesor de los tablones (m). */
  readonly thickness: number;
  /** Largo aproximado de cada tablón (m). */
  readonly segmentLength: number;
  /** Altura de los bordes laterales sobre el piso (m); 0 = sin bordes. */
  readonly railHeight: number;
  readonly railThickness: number;
  /** Tipo de bloque especial de cada tablón (por índice); undefined = tablón común. */
  readonly classify?: (plankIndex: number) => SolidKind | undefined;
}

export interface BoxPiece {
  readonly mesh: Mesh;
  readonly kind?: SolidKind;
}

export interface BoxPath {
  readonly planks: BoxPiece[];
  readonly rails: Mesh[];
}

const PLANK_OVERLAP = 0.05; // un poco más largos, para no dejar rendijas entre tablones
const MIN_SEGMENT_LENGTH = 0.05;
const MIN_POINT_DISTANCE = 1e-3;

/** Puntos a distancia (aproximadamente) constante a lo largo de la curva, incluyendo el primero y el último. */
export function resampleByLength(points: readonly Vector3[], spacing: number): Vector3[] {
  const samples: Vector3[] = [points[0].clone()];
  let carried = 0; // distancia recorrida desde la última muestra

  for (let index = 1; index < points.length; index++) {
    const end = points[index];
    let from = points[index - 1].clone();
    let remaining = Vector3.Distance(from, end);

    while (remaining > 0 && carried + remaining >= spacing) {
      const point = Vector3.Lerp(from, end, (spacing - carried) / remaining);
      samples.push(point);
      from = point;
      remaining = Vector3.Distance(from, end);
      carried = 0;
    }
    carried += remaining;
  }

  const last = points[points.length - 1];
  if (Vector3.Distance(samples[samples.length - 1], last) > MIN_POINT_DISTANCE) {
    samples.push(last.clone());
  }
  return samples;
}

/**
 * Camino armado solo con cajas: un tablón por tramo, inclinado según la pendiente, y dos bordes laterales.
 * `centerPath` son los puntos del centro de la superficie superior; los tablones se unen por sus bordes superiores.
 */
export function createBoxPath(
  scene: Scene,
  name: string,
  centerPath: readonly Vector3[],
  materials: BoxPathMaterials,
  options: BoxPathOptions,
): BoxPath {
  const { halfWidth, thickness, segmentLength, railHeight, railThickness, classify } = options;
  const samples = resampleByLength(centerPath, segmentLength);
  const planks: BoxPiece[] = [];
  const rails: Mesh[] = [];

  for (let index = 0; index < samples.length - 1; index++) {
    const start = samples[index];
    const end = samples[index + 1];
    const length = Vector3.Distance(start, end);
    if (length < MIN_SEGMENT_LENGTH) {
      continue;
    }

    // Orientación: el +Z local del tablón apunta de start a end (pitch negativo = sube).
    const yaw = Math.atan2(end.x - start.x, end.z - start.z);
    const pitch = -Math.atan2(end.y - start.y, Math.hypot(end.x - start.x, end.z - start.z));
    const rotation = Matrix.RotationYawPitchRoll(yaw, pitch, 0);
    const up = Vector3.TransformNormal(Vector3.Up(), rotation);
    const right = Vector3.TransformNormal(Vector3.Right(), rotation);
    const middle = Vector3.Center(start, end);

    const kind = classify?.(index);
    const plank = CreateBox(
      `${name}-plank-${index}`,
      { width: halfWidth * 2, height: thickness, depth: length + PLANK_OVERLAP },
      scene,
    );
    plank.position = middle.subtract(up.scale(thickness / 2)); // la cara superior pasa por la curva
    plank.rotation.set(pitch, yaw, 0);
    plank.material = kind === "breakable" ? materials.breakable : kind === "falling" ? materials.falling : materials.normal;
    planks.push(kind ? { mesh: plank, kind } : { mesh: plank });

    if (railHeight > 0) {
      for (const side of [-1, 1]) {
        const rail = CreateBox(
          `${name}-rail-${index}-${side}`,
          { width: railThickness, height: railHeight + thickness, depth: length + PLANK_OVERLAP },
          scene,
        );
        rail.position = middle
          .add(right.scale(side * (halfWidth + railThickness / 2)))
          .add(up.scale((railHeight - thickness) / 2));
        rail.rotation.set(pitch, yaw, 0);
        rail.material = materials.normal;
        rails.push(rail);
      }
    }
  }
  return { planks, rails };
}