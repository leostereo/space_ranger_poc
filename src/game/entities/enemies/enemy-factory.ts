import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

import type { AssetRegistry } from "../../assets/asset-registry";
import type { EnemySpawn, EnemySpawns, EnemyType } from "../../levels/level-definition";
import { DummyTarget } from "./dummy-target";
import type { Enemy } from "./enemy";
import { EnemiesManager } from "./enemies-manager";
import { StaticDrone } from "./static-drone";

export interface EnemyDeps {
  readonly scene: Scene;
  readonly registry: AssetRegistry;
  /** ¿Esta malla es del jugador (o de su board)? Los enemigos que disparan lo usan para saber si lo alcanzaron. */
  readonly isPlayerMesh: (mesh: AbstractMesh) => boolean;
}

type EnemyBuilder = (spawn: EnemySpawn, id: string, deps: EnemyDeps) => Enemy;

/** Un builder por tipo de enemigo. Para agregar uno: crear la clase y registrarla acá. */
const ENEMY_BUILDERS: Readonly<Partial<Record<EnemyType, EnemyBuilder>>> = {
  dummyTarget: (spawn, id, deps) => new DummyTarget(id, spawn.position, deps),
  staticDrone: (spawn, id, deps) => new StaticDrone(id, spawn, deps),
};

/** Crea todos los enemigos que pide el nivel (por categoría) y los deja registrados en un EnemiesManager. */
export function createEnemiesManager(spawns: EnemySpawns, deps: EnemyDeps): EnemiesManager {
  const manager = new EnemiesManager();
  try {
    for (const [type, entries] of Object.entries(spawns) as [EnemyType, readonly EnemySpawn[] | undefined][]) {
      if (!entries || entries.length === 0) {
        continue;
      }
      const build = ENEMY_BUILDERS[type];
      if (!build) {
        throw new Error(`[createEnemiesManager] there is no builder registered for the enemy "${type}"`);
      }
      entries.forEach((spawn, index) => manager.add(build(spawn, `${type}-${index + 1}`, deps)));
    }
  } catch (error) {
    manager.dispose(); // no dejar enemigos a medio crear
    throw error;
  }
  return manager;
}