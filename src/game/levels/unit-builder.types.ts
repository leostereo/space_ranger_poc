import type { Scene } from "@babylonjs/core/scene";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh"; // 🟢 Cambiado a Mesh
import type { EnemySpawn } from "./level-definition"; 
// src/game/levels/unit-builder.types.ts
export type UnitKind = "spawn_platform" | "kamikaze_bridge" | "empty_tunnel";


export interface UnitData {
  readonly id: string;
  readonly kind: UnitKind;
  readonly length: number;
  readonly distanceToEnable: number;
  readonly enabledDefault: boolean;
}

export interface ManagedUnitInstance {
  readonly id: string;
  readonly kind: UnitKind;
  readonly centerPosition: Vector3;
  readonly distanceToEnable: number;
  readonly enabledDefault: boolean;
  readonly meshes: Mesh[]; // 🟢 Cambiado a Mesh[]
  readonly enemySpawns: EnemySpawn[];
  isCurrentlyActive: boolean;
}

export interface BuilderResult {
  readonly centerPosition: Vector3;
  readonly meshes: Mesh[]; // 🟢 Cambiado a Mesh[]
  readonly enemySpawns: EnemySpawn[];
  readonly nextPosition: Vector3;
}

export type UnitBuilderFn = (
  scene: Scene,
  unit: UnitData,
  currentPosition: Vector3,
  forwardDirection: Vector3
) => BuilderResult;
