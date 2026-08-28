// src/poc3-jetpack_character_fsm/strategies/stand-alone/stand-alone.physics.controller.ts
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { Scene } from "@babylonjs/core/scene";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import { generalConfig } from "@/poc/config.general";
import type { IPhysicsController } from "../contracts/iphysics-controller";
import type { CharacterInputState } from "../../character.input";

// TODO: mover a config.general.ts junto con el resto de TMP_CONFIG de utils.ts
const WALK_SPEED = 4; // m/s
const RUN_SPEED = 7; // m/s — activo cuando Shift está sostenido y hay movimiento
const TURN_SPEED = Math.PI; // rad/s — ~180°/s, ajustar a gusto
const GROUND_FRICTION = 0.8;
const GROUND_RESTITUTION = 0;
const GROUND_RAY_MARGIN = 0.15;
const UPWARD_VELOCITY_THRESHOLD = 0.5;
const JUMP_IMPULSE = 10;

/** Física de OnGround/OnAir: girar con A/D, mover adelante/atrás con W/S (relativo a facing), detectar piso, saltar. */
export class StandAlonePhysicsController implements IPhysicsController {
  private _groundDetected = true;
  private _ray = new Ray(Vector3.Zero(), Vector3.Down(), 5);

  constructor(
    private scene: Scene,
    private characterAggregate: PhysicsAggregate,
    private getInput: () => CharacterInputState,
    initialGroundDetected: boolean,
  ) {
    this._groundDetected = initialGroundDetected;
    this._setupFallAndLanding();
  }

  private _setupFallAndLanding(): void {
    this.characterAggregate.body.setGravityFactor(1);

    const massProperties = this.characterAggregate.body.getMassProperties();
    if (massProperties.inertia) {
      massProperties.inertia.x = 0;
      massProperties.inertia.z = 0;
      this.characterAggregate.body.setMassProperties(massProperties);
    }

    if (this.characterAggregate.material) {
      this.characterAggregate.material.friction = GROUND_FRICTION;
      this.characterAggregate.material.restitution = GROUND_RESTITUTION;
    }
  }

tick(dt: number): void {
  this._updateGroundDetection();

  const { forward, backward, left, right, cruise } = this.getInput();

  this._applyTurn(left, right); // ← ya no necesita dt, la física integra la velocidad angular sola
  this._applyMove(forward, backward, cruise);
}

  /** A/D: rotación pura en Y, transversal a Idle/Walking/Running (funciona esté o no en movimiento). */
private _applyTurn(left: boolean, right: boolean): void {
  const turnDir = (right ? 1 : 0) - (left ? 1 : 0);
  this.characterAggregate.body.setAngularVelocity(new Vector3(0, turnDir * TURN_SPEED, 0));
}

  /** W/S: avanza/retrocede según el forward actual (ya rotado por _applyTurn). Sin input, frena en seco horizontalmente. */
  private _applyMove(forward: boolean, backward: boolean, cruise: boolean): void {
    const currentVelocity = this.characterAggregate.body.getLinearVelocity();

    if (!forward && !backward) {
      this.characterAggregate.body.setLinearVelocity(new Vector3(0, currentVelocity.y, 0));
      return;
    }

    const dirSign = (forward ? 1 : 0) - (backward ? 1 : 0);
    const facing = this.characterAggregate.transformNode.forward.scale(dirSign);
    const speed = cruise ? RUN_SPEED : WALK_SPEED;

    this.characterAggregate.body.setLinearVelocity(
      new Vector3(facing.x * speed, currentVelocity.y, facing.z * speed),
    );
  }

  isGroundDetected(): boolean {
    return this._groundDetected;
  }

  applyJumpImpulse(): void {
    const currentVelocity = this.characterAggregate.body.getLinearVelocity();
    this.characterAggregate.body.setLinearVelocity(
      new Vector3(currentVelocity.x, JUMP_IMPULSE, currentVelocity.z),
    );
  }

  private _updateGroundDetection(): void {
    const capsuleHeight = generalConfig.playerConfig.height;
    const rayLength = capsuleHeight / 2 + GROUND_RAY_MARGIN;

    const origin = this.characterAggregate.transformNode.getAbsolutePosition();
    this._ray.origin.set(origin.x, origin.y, origin.z);
    this._ray.length = rayLength;

    const hit = this.scene.pickWithRay(
      this._ray,
      (mesh) => mesh.isPickable &&
        mesh !== this.characterAggregate.transformNode
        && mesh.name !== 'playerCapsule'
    );

    const verticalVelocity = this.characterAggregate.body.getLinearVelocity().y;
    const isMovingUpward = verticalVelocity > UPWARD_VELOCITY_THRESHOLD;

    this._groundDetected = !!(hit && hit.hit) && !isMovingUpward;
  }

  dispose(): void {}
}