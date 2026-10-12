import type { EnemySpawn } from "../../levels/level-definition";
import { DroneBase } from "./drone/drone-base";
import type { EnemyDeps } from "./enemy-factory";

/**
 * Dron fijo: flota a una altura constante, no se mueve y dispara cada 3 segundos hacia su forward
 * (el cañón se inclina para apuntar exacto). Más adelante: física, flotación, pitch y roll.
 */
export class StaticDrone extends DroneBase {
  constructor(id: string, spawn: EnemySpawn, deps: EnemyDeps) {
    super(id, "staticDrone", spawn, deps, { accentMaterial: "static-drone-accent", pitchToForward: true });
  }
}