// src/poc4-.../strategies/hover-board/board.builder.ts
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsAggregate as PhysicsAggregateCtor } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import type { Material } from "@babylonjs/core/Materials/material";
import { createBoardPrefab } from "@/game/assets/prefabs/board-prefab";
import { BOARD_MASS } from "./hover-board.constants";
import { PhysicsShapeType } from "@babylonjs/core";

/** Mismo prefijo que el resto del equipo del Character. */
const BOARD_PREFIX = "player:";

export interface BoardBuildResult {
  boardMesh: Mesh;
  boardAggregate: PhysicsAggregate;
}

export function board_builder(
  scene: Scene,
  material: Material,
  spawnPosition: Vector3,
  spawnRotationY: number = 0,
): BoardBuildResult {
  const boardMesh = createBoardPrefab(scene, material, BOARD_PREFIX).mesh;

  boardMesh.position.copyFrom(spawnPosition);
  boardMesh.rotationQuaternion = Quaternion.FromEulerAngles(0, spawnRotationY, 0);

  const mass = BOARD_MASS;
  const friction = 0.2;
  const restitution = 0;
  const boardAggregate = new PhysicsAggregateCtor(
    boardMesh,
    PhysicsShapeType.CONVEX_HULL,
    { mass, friction, restitution },
    scene,
  );

  const massProperties = boardAggregate.body.getMassProperties();
  if (massProperties.inertia) {
    massProperties.inertia.x = 0;
    massProperties.inertia.z = 0;
    boardAggregate.body.setMassProperties(massProperties);
  }
  boardAggregate.body.setGravityFactor(1);

  return { boardMesh, boardAggregate };
}