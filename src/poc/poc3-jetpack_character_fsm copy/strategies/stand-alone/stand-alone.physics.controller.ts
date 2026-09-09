import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { Scene } from "@babylonjs/core/scene";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import { Ray } from "@babylonjs/core/Culling/ray";
import { generalConfig } from "@/poc/config.general";
import type { IPhysicsController } from "../contracts/iphysics-controller";
import type { CharacterInputState } from "../../character.input";
import { Color3, RayHelper } from "@babylonjs/core";

const WALK_SPEED = 4;
const RUN_SPEED = 7;
const TURN_SPEED = Math.PI;
const GROUND_FRICTION = 0.8;
const GROUND_RESTITUTION = 0;
const GROUND_RAY_MARGIN = 0.5;
const UPWARD_VELOCITY_THRESHOLD = 0.5;
const JUMP_IMPULSE = 10;
const ROLL_INITIAL_SPEED = 8; // m/s, ajustar a gusto
const ROLL_MAX_DURATION_SECONDS = 1.2; // safety net si notifyLandingRollEnd() nunca llega

export class StandAlonePhysicsController implements IPhysicsController {
  private _groundDetected = true;
  private _ray = new Ray(Vector3.Zero(), Vector3.Down(), 5);

  private _isRolling = false;
  private _rollElapsed = 0;
  private _rollDirection = Vector3.Zero();

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

    if (this._isRolling) {
      this._tickRoll(dt);
      return; // input normal (turn/move) suspendido mientras rollea
    }

    const { forward, backward, left, right, cruise } = this.getInput();

    this._applyTurn(left, right);
    this._applyMove(forward, backward, cruise);
  }

  /** Decae ROLL_INITIAL_SPEED -> 0 mientras dure el roll, en la dirección capturada al entrar. */
  private _tickRoll(dt: number): void {
    this._rollElapsed += dt;
    const t = Math.min(this._rollElapsed / ROLL_MAX_DURATION_SECONDS, 1);
    const currentSpeed = Scalar.Lerp(ROLL_INITIAL_SPEED, 0, t);
    const currentVelocity = this.characterAggregate.body.getLinearVelocity();

    this.characterAggregate.body.setLinearVelocity(
      new Vector3(
        this._rollDirection.x * currentSpeed,
        currentVelocity.y,
        this._rollDirection.z * currentSpeed,
      ),
    );

    if (t >= 1) {
      this._isRolling = false; // safety net: si el evento de animación nunca llegó
    }
  }

  private _applyTurn(left: boolean, right: boolean): void {
    const turnDir = (right ? 1 : 0) - (left ? 1 : 0);
    this.characterAggregate.body.setAngularVelocity(new Vector3(0, turnDir * TURN_SPEED, 0));
  }

  private _applyMove(forward: boolean, backward: boolean, cruise: boolean): void {
    const currentVelocity = this.characterAggregate.body.getLinearVelocity();

    if (!forward && !backward) {
      if (!this._groundDetected) return;
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

  /** Llamado cuando OnGroundFsm.notifyLanding() decide LandingRoll. */
  notifyLandingRollStart(): void {
    const velocity = this.characterAggregate.body.getLinearVelocity();
    const horizontal = new Vector3(velocity.x, 0, velocity.z);

    this._rollDirection = horizontal.lengthSquared() > 0.0001
      ? horizontal.normalize()
      : this.characterAggregate.transformNode.forward.clone();

    this._isRolling = true;
    this._rollElapsed = 0;
  }

  /** Llamado cuando el AnimationEvent de landing-roll llega al frame final. */
  notifyLandingRollEnd(): void {
    this._isRolling = false;
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

    //console.log(hit?.distance, hit?.pickedMesh?.name, hit?.hit, verticalVelocity, isMovingUpward)

    this._groundDetected = !!(hit && hit.hit) && !isMovingUpward;

  }

  dispose(): void { }
}