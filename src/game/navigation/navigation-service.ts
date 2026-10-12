import type { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { PatrolRegion } from "./patrol-region";

/** Puntos navegables para quienes se mueven solos (hoy, los drones). */
export interface NavigationService {
  /**
   * Punto aleatorio navegable que cumple la región: dentro de su volumen y sobre su plano (si los tiene).
   * Devuelve null si no encontró uno tras varios intentos (región vacía, fuera del navmesh, etc.).
   * El resultado se escribe en `out`, para no generar basura en cada consulta.
   */
  getRandomPoint(region: PatrolRegion, out?: Vector3): Vector3 | null;
  dispose(): void;
}