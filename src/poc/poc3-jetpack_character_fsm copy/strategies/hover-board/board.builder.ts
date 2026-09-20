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

export function board_builder(
  scene: Scene,
  spawnPosition: Vector3,
  spawnRotationY: number = 0,
): BoardBuildResult {
  const boardResult = AssetManager.getMesh("board", "skateboard");
  const boardTemplate = boardResult?.mesh as Mesh; // CAMBIADO — ya no se usa directo

  if (!boardTemplate) {
    throw new Error("board_builder: AssetManager no tiene 'board'/'skateboard' (¿faltó cargarTodo()?).");
  }

  // NUEVO — clon descartable por cada equip, ya que AssetManager.getMesh("board", ...)
  // devuelve la misma instancia singleton en cada llamada (a diferencia de "character",
  // que sí clona internamente). Sin esto, dispose() en _swapToStandAlone() destruye la
  // geometría real y el segundo equip falla con "0 vértices" en PhysicsAggregate.
  const boardMesh = boardTemplate.clone("skateboard_clone", null) as Mesh;
  boardMesh.setEnabled(true);

  boardMesh.position.copyFrom(spawnPosition);
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