// src/poc4-.../strategies/hover-board/board.builder.ts
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsAggregate as PhysicsAggregateCtor } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { AssetManager } from "@/services/assets-manager";
import { generalConfig } from "@/poc/config.general";
import { PhysicsShapeType } from "@babylonjs/core";

export interface BoardBuildResult {
  boardMesh: Mesh;
  boardAggregate: PhysicsAggregate;
}

/**
 * Extraído de board_character_builder (POC2): sólo crea el mesh + aggregate del board.
 * A diferencia de POC2, NO crea skater/cápsula — en POC4 ya existen (character_builder),
 * y el parenting se hace aparte en _swapToHoverBoard(). spawnPosition es la posición
 * actual de la cápsula al momento de equipar (no generalConfig.board.spawn, que es un
 * punto fijo pensado para el modo standalone de POC2).
 */
export function board_builder(
  scene: Scene,
  spawnPosition: Vector3,
  spawnRotationY: number = 0, // NUEVO parámetro, default 0 para no romper otros usos
): BoardBuildResult {
  const boardResult = AssetManager.getMesh("board", "skateboard");
  const boardMesh = boardResult?.mesh as Mesh;

  if (!boardMesh) {
    throw new Error("board_builder: AssetManager no tiene 'board'/'skateboard' (¿faltó cargarTodo()?).");
  }

  boardMesh.position.copyFrom(spawnPosition);
  // CAMBIADO: aplicar el yaw de spawn ANTES de crear el aggregate, no Identity()
  boardMesh.rotationQuaternion = Quaternion.FromEulerAngles(0, spawnRotationY, 0);

  const { mass, friction, restitution } = generalConfig.board;
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