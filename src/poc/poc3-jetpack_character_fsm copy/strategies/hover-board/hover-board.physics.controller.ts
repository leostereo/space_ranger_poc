// src/poc4-.../strategies/hover-board/hover-board.physics.controller.ts
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import { Tools } from "@babylonjs/core/Misc/tools";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";

import type { BoardFsm } from "../../character-fsm/board-fsm/board.fsm";
import { generalConfig } from "@/poc/config.general";
import { BoardInputState } from "@/poc/poc1-floating_board/board-input";

/**
 * Portado de BoardController (POC2). Diferencias con el original:
 * - No crea ni tickea su propio BoardFsm — lo recibe por constructor (referencia a
 *   characterFsm.boardSubFsm, que ya existe y ya se tickea desde CharacterFsm.tick()).
 *   Sólo LEE su estado para decidir qué fuerzas aplicar, mismo criterio que POC2 pero
 *   sin ser dueño de la FSM.
 * - No consume jump/testImpulse del input — eso vive en HoverBoardInputController.
 * - tick(dt) recibe dt por parámetro en vez de calcularlo con getDeltaTime() (mismo
 *   patrón que StandAlonePhysicsController).
 * - Thruster: TODO, pendiente portar board.thruster.ts.
 */
export class HoverBoardPhysicsController {
  readonly fsm: BoardFsm;

  private elapsedTime = 0;
  private groundLostTimer = 0;
  private _groundDetected = false;
  private _lastGroundDistance = Infinity;

  private glideBoostChain = 0;
  private jumpSettleTimer = 0;
  private boostSettleTimer = 0;
  private rollAngle = 0;
  private pitchAngle = 0;

  private previousVerticalVelocity = 0;
  private verticalVelocity = 0;
  private verticalAcceleration = 0;
  private forwardSpeedTelemetry = 0;

  private _ray = new Ray(Vector3.Zero(), Vector3.Down(), 100);
  private _raycastOrigin = new Vector3();

  private _forwardReference = Vector3.Forward();
  private _forwardTemp = new Vector3();
  private _rightReference = Vector3.Right();
  private _rightTemp = new Vector3();
  private _velocityTemp = new Vector3();
  private _forwardVelocityTemp = new Vector3();
  private _currentForwardSpeed = 0;
  private _lastGroundNormal = Vector3.Up();

  constructor(
    private scene: Scene,
    private boardMesh: Mesh,
    private boardAggregate: PhysicsAggregate,
    private getInput: () => BoardInputState,
    boardFsm: BoardFsm,
  ) {
    if (!this.boardMesh.rotationQuaternion) {
      this.boardMesh.rotationQuaternion = Quaternion.Identity();
    }
    this.fsm = boardFsm;
  }

  /** Llamar desde el strategy.tick(dt), antes de que CharacterFsm.tick() corra la transición del boardSubFsm. */
  tick(dt: number): void {
    this.elapsedTime += dt;

    this.boardMesh.computeWorldMatrix(true);

    if (this.jumpSettleTimer > 0) this.jumpSettleTimer -= dt;
    if (this.boostSettleTimer > 0) this.boostSettleTimer -= dt;

    this._updateGroundDetection();

    if (this._groundDetected) {
      this.groundLostTimer = 0;
    } else {
      this.groundLostTimer += dt;
    }

    this._updateCurrentForwardSpeed();

    // A diferencia de POC2 (que tickeaba su propia fsm acá), acá se lee el estado
    // ACTUAL (previo al tick de este frame, que corre después vía CharacterFsm.tick())
    // — mismo desfase de un frame que ya asumimos al separar physics de fsm en StandAlone.
    const currentMacroState = this.fsm.getState();
    const currentSubState = this.fsm.getActiveSubState();

    if (currentMacroState === "Hovering") {
      this._applyHoverForce();
    } else {
      if (currentSubState === "Diving") {
        this._applyDiveForce();
      } else if (currentSubState === "Gliding") {
        this._applyGlidingLiftForce();
      }
    }

    this._updateRollAndYaw(dt);
    this._updateForwardForce();
    this._applyLateralFriction();
    this._updatePitch(dt);
  }

  /** Llamar en scene.onAfterPhysicsObservable. Roll y pitch son 100% visuales. */
  applyVisualRoll(): void {
    const rollQuat = Quaternion.RotationAxis(Axis.Z, this.rollAngle);
    const pitchQuat = Quaternion.RotationAxis(Axis.X, this.pitchAngle);
    const visualOffset = rollQuat.multiply(pitchQuat);
    this.boardMesh.rotationQuaternion = this.boardMesh.rotationQuaternion!.multiply(visualOffset);
  }

  /** Llamar en scene.onAfterPhysicsObservable, junto con applyVisualRoll. Para HUD/telemetría futura. */
  updateTelemetry(dt: number): void {
    this.verticalVelocity = this.boardAggregate.body.getLinearVelocity().y;
    this.verticalAcceleration = dt > 0 ? (this.verticalVelocity - this.previousVerticalVelocity) / dt : 0;
    this.previousVerticalVelocity = this.verticalVelocity;

    Vector3.TransformNormalToRef(this._forwardReference, this.boardMesh.getWorldMatrix(), this._forwardTemp);
    this.boardAggregate.body.getLinearVelocityToRef(this._velocityTemp);
    this.forwardSpeedTelemetry = Vector3.Dot(this._velocityTemp, this._forwardTemp);
  }

  getVerticalVelocity(): number { return this.verticalVelocity; }
  getVerticalAcceleration(): number { return this.verticalAcceleration; }
  getForwardSpeed(): number { return this.forwardSpeedTelemetry; }

  /** Deps para BoardFsm (ver character.base.ts). */
  isGroundDetected(): boolean { return this._groundDetected; }
  groundLostElapsed(): number { return this.groundLostTimer; }
  isJumpSettled(): boolean { return this.jumpSettleTimer <= 0; }
  isBoostSettled(): boolean { return this.boostSettleTimer <= 0; }

  /** Llamado por BoardFsm.onEnterJumping vía deps — aplica el impulso físico. */
  onEnterJumping(): void {
    const { jumpSettleDuration, impulse } = generalConfig.boost;
    const mass = generalConfig.board.mass;
    this.boardAggregate.body.applyImpulse(new Vector3(0, mass * impulse, 0), this.boardMesh.getAbsolutePosition());
    this.jumpSettleTimer = jumpSettleDuration;
  }

  /** Llamado por BoardFsm.onEnterGliderBoost vía deps. */
  onEnterGliderBoost(): void {
    const { gliderLiftImpulse, gliderPitchKick, gliderDecayFactor, gliderSettleDuration } = generalConfig.boost;
    const mass = generalConfig.board.mass;

    const powerMultiplier = Math.pow(gliderDecayFactor, this.glideBoostChain);
    const impulse = mass * gliderLiftImpulse * powerMultiplier;
    this.boardAggregate.body.applyImpulse(new Vector3(0, impulse, 0), this.boardMesh.getAbsolutePosition());

    this.pitchAngle = -Tools.ToRadians(gliderPitchKick) * powerMultiplier;
    this.glideBoostChain++;
    this.boostSettleTimer = gliderSettleDuration;
  }

  /** Llamado por BoardFsm.onEnterHovering vía deps. */
  onEnterHovering(): void {
    this.glideBoostChain = 0;
  }

  private _updateGroundDetection(): void {
    const { height, hoverEngagementFactor } = generalConfig.hover;
    const thicknessOffset = generalConfig.board.height * 0.5 + 0.05;

    this._raycastOrigin.copyFrom(this.boardMesh.absolutePosition);
    this._ray.origin.set(this._raycastOrigin.x, this._raycastOrigin.y - thicknessOffset, this._raycastOrigin.z);

    const hit = this.scene.pickWithRay(
      this._ray,
      (mesh) => mesh.isPickable && mesh !== this.boardMesh && mesh.parent !== this.boardMesh,
    );
    this._lastGroundDistance = hit && hit.hit ? hit.distance + thicknessOffset : Infinity;

    if (hit && hit.hit) {
      const normal = hit.getNormal(true, false);
      if (normal) this._lastGroundNormal.copyFrom(normal);
    }

    const hoverEngagementThreshold = height * hoverEngagementFactor;
    if (this._lastGroundDistance <= height) {
      this._groundDetected = true;
    } else if (this._lastGroundDistance > hoverEngagementThreshold) {
      this._groundDetected = false;
    }
  }

  private _applyHoverForce(): void {
    const { height, springStrength, damping, bobAmplitude, bobFrequency } = generalConfig.hover;
    const mass = generalConfig.board.mass;

    const angularFrequency = bobFrequency * 2 * Math.PI;
    const dynamicTargetHeight = height + bobAmplitude * Math.sin(this.elapsedTime * angularFrequency);

    const actualDistanceToGround = this._lastGroundDistance === Infinity ? 999 : this._lastGroundDistance;
    const error = dynamicTargetHeight - actualDistanceToGround;
    const verticalVelocity = this.boardAggregate.body.getLinearVelocity().y;

    let forceY = mass * (error * springStrength - verticalVelocity * damping);
    forceY += mass * 9.81;

    if (forceY < 0) forceY = 0;
    const maxForce = mass * 9.81 * 8;
    if (forceY > maxForce) forceY = maxForce;

    this.boardAggregate.body.applyForce(new Vector3(0, forceY, 0), this._raycastOrigin);
  }

  private _updatePitch(dt: number): void {
    const macroState = this.fsm.getState();
    const { maxPitchAngle: maxPitchAngleDeg, pitchLerpSpeed, surfaceAlignLerpSpeed } = generalConfig.movement;
    const maxPitchAngle = Tools.ToRadians(maxPitchAngleDeg);

    let targetPitch = 0;
    let lerpSpeed = pitchLerpSpeed;

    if (macroState === "Falling") {
      const { pitchDown } = this.getInput();
      targetPitch = pitchDown ? maxPitchAngle : 0;
    } else if (macroState === "Hovering") {
      targetPitch = this._computeSurfaceAlignPitch(maxPitchAngle);
      lerpSpeed = surfaceAlignLerpSpeed;
    }

    const lerpFactor = 1 - Math.exp(-lerpSpeed * dt);
    this.pitchAngle += (targetPitch - this.pitchAngle) * lerpFactor;
  }

  private _computeSurfaceAlignPitch(maxPitchAngle: number): number {
    Vector3.TransformNormalToRef(this._forwardReference, this.boardMesh.getWorldMatrix(), this._forwardTemp);
    this._forwardTemp.y = 0;
    const len = this._forwardTemp.length();
    if (len < 0.0001) return this.pitchAngle;

    this._forwardTemp.scaleInPlace(1 / len);

    const nUp = Vector3.Dot(this._lastGroundNormal, Vector3.Up());
    const nForward = Vector3.Dot(this._lastGroundNormal, this._forwardTemp);
    const raw = Math.atan2(nForward, nUp);

    return Math.max(-maxPitchAngle, Math.min(maxPitchAngle, raw));
  }

  private _applyDiveForce(): void {
    const { maxPitchAngle: maxPitchAngleDeg, pitchDiveAcceleration } = generalConfig.movement;
    const maxPitchAngle = Tools.ToRadians(maxPitchAngleDeg);
    const mass = generalConfig.board.mass;

    if (this.pitchAngle <= 0.001) return;

    const diveIntensity = this.pitchAngle / maxPitchAngle;
    const diveForce = mass * pitchDiveAcceleration * diveIntensity;

    this.boardAggregate.body.applyForce(new Vector3(0, -diveForce, 0), this.boardMesh.getAbsolutePosition());
  }

  private _updateRollAndYaw(dt: number): void {
    const { turnLeft, turnRight } = this.getInput();
    const { rollAngleAtLowSpeed, rollAngleAtHighSpeed, rollSpeedRange, rollLerpSpeed, yawFromRollFactor } =
      generalConfig.movement;

    const speedT = Scalar.Clamp(
      (this.forwardSpeedTelemetry - rollSpeedRange.min) / (rollSpeedRange.max - rollSpeedRange.min),
      0,
      1,
    );
    const dynamicMaxRollAngle = Scalar.Lerp(rollAngleAtLowSpeed, rollAngleAtHighSpeed, speedT);

    let targetRoll = 0;
    if (turnLeft) targetRoll += dynamicMaxRollAngle;
    if (turnRight) targetRoll -= dynamicMaxRollAngle;

    const lerpFactor = 1 - Math.exp(-rollLerpSpeed * dt);
    this.rollAngle += (targetRoll - this.rollAngle) * lerpFactor;

    const yawRate = -this.rollAngle * yawFromRollFactor;
    const current = this.boardAggregate.body.getAngularVelocity();

    this.boardAggregate.body.setAngularVelocity(new Vector3(current.x * 0.9, yawRate, current.z * 0.9));
  }

  private _updateForwardForce(): void {
    const { forwardForce, brakingDragFactor } = generalConfig.movement;
    const mass = generalConfig.board.mass;

    Vector3.TransformNormalToRef(this._forwardReference, this.boardMesh.getWorldMatrix(), this._forwardTemp);

    if (this.getInput().forward) {
      this.boardAggregate.body.applyForce(
        this._forwardTemp.scaleInPlace(forwardForce),
        this.boardMesh.getAbsolutePosition(),
      );
      return;
    }

    this.boardAggregate.body.getLinearVelocityToRef(this._velocityTemp);
    const forwardSpeed = Vector3.Dot(this._velocityTemp, this._forwardTemp);

    if (forwardSpeed > 0.05) {
      this._forwardTemp.scaleToRef(-forwardSpeed * mass * brakingDragFactor, this._forwardVelocityTemp);
      this.boardAggregate.body.applyForce(this._forwardVelocityTemp, this.boardMesh.getAbsolutePosition());
    }
  }

  private _updateCurrentForwardSpeed(): void {
    Vector3.TransformNormalToRef(this._forwardReference, this.boardMesh.getWorldMatrix(), this._forwardTemp);
    this.boardAggregate.body.getLinearVelocityToRef(this._velocityTemp);
    this._currentForwardSpeed = Vector3.Dot(this._velocityTemp, this._forwardTemp);
  }

  private _applyLateralFriction(): void {
    const { driftGripFactor } = generalConfig.movement;
    const mass = generalConfig.board.mass;

    this.boardAggregate.body.getLinearVelocityToRef(this._velocityTemp);
    Vector3.TransformNormalToRef(this._rightReference, this.boardMesh.getWorldMatrix(), this._rightTemp);

    const lateralSpeed = Vector3.Dot(this._velocityTemp, this._rightTemp);

    if (Math.abs(lateralSpeed) > 0.01) {
      const counterForce = this._rightTemp.scaleInPlace(-lateralSpeed * mass * driftGripFactor);
      this.boardAggregate.body.applyForce(counterForce, this.boardMesh.getAbsolutePosition());
    }
  }

  private _applyGlidingLiftForce(): void {
    const mass = generalConfig.board.mass;
    const glideFactor = 0.08;

    this.boardAggregate.body.getLinearVelocityToRef(this._velocityTemp);
    const fallSpeed = this._velocityTemp.y;

    if (fallSpeed < 0) {
      const horizontalVelocity = new Vector3(this._velocityTemp.x, 0, this._velocityTemp.z);
      const forwardSpeed = horizontalVelocity.length();

      if (forwardSpeed > 1) {
        let liftAmount = mass * forwardSpeed * Math.abs(fallSpeed) * glideFactor;
        const maxLiftLimit = mass * 9.81 * 0.95;
        if (liftAmount > maxLiftLimit) liftAmount = maxLiftLimit;

        this.boardAggregate.body.applyForce(
          new Vector3(0, liftAmount, 0),
          this.boardMesh.getAbsolutePosition(),
        );
      }
    }
  }

  dispose(): void {
    // No dispone boardMesh/boardAggregate — dueño: character.base.ts (mismo criterio
    // que StandAlonePhysicsController no dispone characterAggregate).
  }
}