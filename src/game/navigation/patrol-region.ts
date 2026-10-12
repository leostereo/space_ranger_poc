import { Vector3 } from "@babylonjs/core/Maths/math.vector";

/** Volumen que limita dónde puede caer un punto. */
export type PatrolVolume =
  | { readonly kind: "box"; readonly center: Vector3; readonly size: Vector3 }
  | { readonly kind: "sphere"; readonly center: Vector3; readonly radius: number };

/** Plano sobre el que quedan los puntos (define la altura de vuelo). No puede ser vertical. */
export interface PatrolPlane {
  /** Un punto cualquiera del plano. */
  readonly point: Vector3;
  /** Normal del plano; su componente Y no puede ser 0. */
  readonly normal: Vector3;
}

/** Condiciones de un punto aleatorio: dentro del volumen y sobre el plano (ambos opcionales). */
export interface PatrolRegion {
  readonly volume?: PatrolVolume;
  readonly plane?: PatrolPlane;
}

const MIN_NORMAL_Y = 1e-3;
const SPHERE_REJECTION_ATTEMPTS = 16;

const randomBetween = (min: number, max: number): number => min + Math.random() * (max - min);

export function volumeContains(volume: PatrolVolume, point: Vector3): boolean {
  if (volume.kind === "box") {
    return (
      Math.abs(point.x - volume.center.x) <= volume.size.x / 2 &&
      Math.abs(point.y - volume.center.y) <= volume.size.y / 2 &&
      Math.abs(point.z - volume.center.z) <= volume.size.z / 2
    );
  }
  return Vector3.DistanceSquared(point, volume.center) <= volume.radius * volume.radius;
}

/** Altura (Y) del plano en (x, z). */
export function planeHeightAt(plane: PatrolPlane, x: number, z: number): number {
  const { point, normal } = plane;
  if (Math.abs(normal.y) < MIN_NORMAL_Y) {
    throw new Error("[planeHeightAt] a vertical plane has no height at a given (x, z)");
  }
  return point.y - (normal.x * (x - point.x) + normal.z * (z - point.z)) / normal.y;
}

/** Punto uniforme dentro del volumen, escrito en `out`. */
export function randomPointInVolume(volume: PatrolVolume, out: Vector3): Vector3 {
  if (volume.kind === "box") {
    return out.set(
      volume.center.x + randomBetween(-volume.size.x / 2, volume.size.x / 2),
      volume.center.y + randomBetween(-volume.size.y / 2, volume.size.y / 2),
      volume.center.z + randomBetween(-volume.size.z / 2, volume.size.z / 2),
    );
  }

  // Esfera: rechazo dentro del cubo circunscripto.
  const { radius } = volume;
  for (let attempt = 0; attempt < SPHERE_REJECTION_ATTEMPTS; attempt++) {
    out.set(randomBetween(-radius, radius), randomBetween(-radius, radius), randomBetween(-radius, radius));
    if (out.lengthSquared() <= radius * radius) {
      return out.addInPlace(volume.center);
    }
  }
  return out.copyFrom(volume.center);
}