// src/poc3-jetpack_character_fsm/strategies/no-vehicle/no-vehicle.physics.controller.ts
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { IPhysicsController } from "../contracts/iphysics-controller";
import type { CharacterInputState } from "../../character.input";

// TODO: mover a config.general.ts junto con el resto de TMP_CONFIG de utils.ts
const WALK_SPEED = 4; // m/s

/** Física MÍNIMA de OnGround: mover horizontal según WASD sobre la capsule compartida. Sin salto todavía. */
export class NoVehiclePhysicsController implements IPhysicsController {
  constructor(
    private characterAggregate: PhysicsAggregate,
    private getInput: () => CharacterInputState,
  ) {}

  tick(_dt: number): void {
    const { forward, backward, left, right } = this.getInput();

    const dir = new Vector3(
      (right ? 1 : 0) - (left ? 1 : 0),
      0,
      (forward ? 1 : 0) - (backward ? 1 : 0),
    );

    if (dir.lengthSquared() === 0) return;

    dir.normalize();
    const currentVelocity = this.characterAggregate.body.getLinearVelocity();
    this.characterAggregate.body.setLinearVelocity(
      new Vector3(dir.x * WALK_SPEED, currentVelocity.y, dir.z * WALK_SPEED),
    );
  }

  dispose(): void {
    // No posee characterAggregate (es compartida, dueño: character.base.ts) — nada que liberar acá.
  }
}
