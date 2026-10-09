import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

import type { AssetRegistry } from "../../assets/asset-registry";
import type { EnemySpawns, EnemyType } from "../../levels/level-definition";
import { DummyTarget } from "./dummy-target";
import type { Enemy } from "./enemy";
import { EnemiesManager } from "./enemies-manager";

export interface EnemyDeps {
  readonly scene: Scene;
  readonly registry: AssetRegistry;
}

type EnemyBuilder = (spawn: Vector3, id: string, deps: EnemyDeps) => Enemy;

/** Un builder por tipo de enemigo. Para agregar uno: crear la clase y registrarla acá. */
const ENEMY_BUILDERS: Readonly<Partial<Record<EnemyType, EnemyBuilder>>> = {
  dummyTarget: (spawn, id, deps) => new DummyTarget(id, spawn, deps),
};

/** Crea todos los enemigos que pide el nivel (por categoría) y los deja registrados en un EnemiesManager. */
export function createEnemiesManager(spawns: EnemySpawns, deps: EnemyDeps): EnemiesManager {
  const manager = new EnemiesManager();
  try {
    for (const [type, positions] of Object.entries(spawns) as [EnemyType, readonly Vector3[] | undefined][]) {
      if (!positions || positions.length === 0) {
        continue;
      }
      const build = ENEMY_BUILDERS[type];
      if (!build) {
        throw new Error(`[createEnemiesManager] there is no builder registered for the enemy "${type}"`);
      }
      positions.forEach((position, index) => manager.add(build(position, `${type}-${index + 1}`, deps)));
    }
  } catch (error) {
    manager.dispose(); // no dejar enemigos a medio crear
    throw error;
  }
  return manager;
}