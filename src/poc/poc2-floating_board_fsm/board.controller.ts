// src/poc2-floating_board_fsm/board.controller.ts
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import { Tools } from "@babylonjs/core/Misc/tools";

import { BoardFsm } from "./board-fsm/board.fsm";
import { generalConfig } from "../config.general";
import type { BoardInput } from "./board.input";

/**
 * Paso 4b: guards/acciones reales de jump/boost/hover/pitchDown, portadas de
 * FloatingBoardController (POC1). Roll/yaw/forward (A/D/Shift) siguen pendientes.
 */
export class BoardController {
  readonly fsm: BoardFsm;

  private elapsedTime = 0;
  private groundLostTimer = 0;
  private _groundDetected = false;
  private _lastGroundDistance = Infinity;

  private glideBoostChain = 0;
  private jumpSettleTimer = 0;
  private boostSettleTimer = 0;
  private rollAngle = 0; // radianes, usado para el yaw físico (visual queda para cuando se porte applyVisualRoll)
  // Usado sólo por la fuerza de picado (Diving) por ahora — el lerp visual/continuo
  // de _updateAirPitch (POC1) todavía no está portado (gap conocido, ver nota al final del archivo).
  private pitchAngle = 0;

  private _ray = new Ray(Vector3.Zero(), Vector3.Down(), 100);
  private _raycastOrigin = new Vector3();

  // Vectores reutilizados para evitar Garbage Collection en cada frame
  private _forwardReference = Vector3.Forward();
  private _forwardTemp = new Vector3();
  private _rightReference = Vector3.Right();
  private _rightTemp = new Vector3();
  private _velocityTemp = new Vector3();
  private _forwardVelocityTemp = new Vector3();

  constructor(
    private scene: Scene,
    private boardMesh: Mesh,
    private boardAggregate: PhysicsAggregate,
    private input: BoardInput,
  ) {
    if (!this.boardMesh.rotationQuaternion) {
      this.boardMesh.rotationQuaternion = Quaternion.Identity();
    }

    this.fsm = new BoardFsm({
      isGroundDetected: () => this._groundDetected,
      groundLostElapsed: () => this.groundLostTimer,
      coyoteTime: generalConfig.groundCheck.coyoteTime,
      onEnterHovering: () => this._onEnterHovering(),
      onEnterFalling: () => {},

      isJumpSettled: () => this.jumpSettleTimer <= 0,
      onEnterJumping: () => this._onEnterJumping(),

      isPitchDownHeld: () => this.input.current.pitchDown,
      isBoostSettled: () => this.boostSettleTimer <= 0,
      onEnterDiving: () => {},
      onEnterGliderBoost: () => this._onEnterGliderBoost(),
    });
  }

  /** Llamar en `scene.onBeforePhysicsObservable`. */
  update(): void {
    const dt = this.scene.getEngine().getDeltaTime() / 1000;
    this.elapsedTime += dt;

    // Sincroniza el mesh con la rotación real del body físico, eliminando el residuo
    // estético que dejó applyVisualRoll() del frame anterior (roll/pitch son sólo visuales).
    this.boardMesh.computeWorldMatrix(true);

    if (this.jumpSettleTimer > 0) this.jumpSettleTimer -= dt;
    if (this.boostSettleTimer > 0) this.boostSettleTimer -= dt;

    this._updateGroundDetection();

    if (this._groundDetected) {
      this.groundLostTimer = 0;
    } else {
      this.groundLostTimer += dt;
    }

    this.fsm.tick();

    if (this.fsm.getState() === "Hovering") {
      this._applyHoverForce();
    } else if (this.fsm.getActiveSubState() === "Diving") {
      this._applyDiveForce();
    }

    this._updateRollAndYaw(dt);
    this._updateForwardForce();
    this._applyLateralFriction();
    this._updateAirPitch(dt);

    if (this.input.consumeJumpRequest()) {
      this.fsm.requestJump();
    }

    if (this.input.consumeTestImpulseRequest()) {
      this._applyTestImpulse();
    }
  }

  /** Llamar en `scene.onAfterPhysicsObservable`. Roll y pitch son 100% visuales, no tocan física. */
  applyVisualRoll(): void {
    const rollQuat = Quaternion.RotationAxis(Axis.Z, this.rollAngle);
    const pitchQuat = Quaternion.RotationAxis(Axis.X, this.pitchAngle);
    const visualOffset = rollQuat.multiply(pitchQuat);

    this.boardMesh.rotationQuaternion = this.boardMesh.rotationQuaternion!.multiply(visualOffset);
  }

  /** Un solo raycast por frame; el resultado se reutiliza en _applyHoverForce. */
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

    // Hysteresis: engancha bajo `height`, desengancha recién sobre hoverEngagementFactor*height.
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
    forceY += mass * 9.81; // compensación de gravedad

    if (forceY < 0) forceY = 0;
    const maxForce = mass * 9.81 * 8;
    if (forceY > maxForce) forceY = maxForce;

    this.boardAggregate.body.applyForce(new Vector3(0, forceY, 0), this._raycastOrigin);
  }

  /** Lerp continuo de pitchAngle mientras se mantiene W en Falling. Ausente hasta ahora (gap conocido). */
  private _updateAirPitch(dt: number): void {
    const isFalling = this.fsm.getState() === "Falling";
    const { pitchDown } = this.input.current;
    const { pitchLerpSpeed, maxPitchAngle: maxPitchAngleDeg } = generalConfig.movement;
    const maxPitchAngle = Tools.ToRadians(maxPitchAngleDeg);

    const targetPitch = isFalling && pitchDown ? maxPitchAngle : 0;

    const lerpFactor = 1 - Math.exp(-pitchLerpSpeed * dt);
    this.pitchAngle += (targetPitch - this.pitchAngle) * lerpFactor;
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

  private _onEnterHovering(): void {
    this.glideBoostChain = 0;
  }

  private _updateRollAndYaw(dt: number): void {
    const { turnLeft, turnRight } = this.input.current;
    const { maxRollAngle, rollLerpSpeed, yawFromRollFactor } = generalConfig.movement;

    let targetRoll = 0;
    if (turnLeft) targetRoll += maxRollAngle;
    if (turnRight) targetRoll -= maxRollAngle;

    const lerpFactor = 1 - Math.exp(-rollLerpSpeed * dt);
    this.rollAngle += (targetRoll - this.rollAngle) * lerpFactor;

    const yawRate = -this.rollAngle * yawFromRollFactor;
    const current = this.boardAggregate.body.getAngularVelocity();

    // Forzamos la velocidad angular en Y. Mantenemos X y Z amortiguados (el lock de inercia
    // en board.base.ts ya los bloquea del todo, esto es defensivo por si cambia más adelante).
    this.boardAggregate.body.setAngularVelocity(new Vector3(current.x * 0.9, yawRate, current.z * 0.9));
  }

  private _updateForwardForce(): void {
    const { forwardForce, brakingDragFactor } = generalConfig.movement;
    const mass = generalConfig.board.mass;

    Vector3.TransformNormalToRef(this._forwardReference, this.boardMesh.getWorldMatrix(), this._forwardTemp);

    if (this.input.current.forward) {
      this.boardAggregate.body.applyForce(
        this._forwardTemp.scaleInPlace(forwardForce),
        this.boardMesh.getAbsolutePosition(),
      );
      return;
    }

    // Soltó el input: frenar sólo si efectivamente se está moviendo hacia adelante
    this.boardAggregate.body.getLinearVelocityToRef(this._velocityTemp);
    const forwardSpeed = Vector3.Dot(this._velocityTemp, this._forwardTemp);

    if (forwardSpeed > 0.05) {
      this._forwardTemp.scaleToRef(-forwardSpeed * mass * brakingDragFactor, this._forwardVelocityTemp);
      this.boardAggregate.body.applyForce(this._forwardVelocityTemp, this.boardMesh.getAbsolutePosition());
    }
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

  private _onEnterJumping(): void {
    const { jumpSettleDuration, impulse } = generalConfig.boost;
    const mass = generalConfig.board.mass;

    this.boardAggregate.body.applyImpulse(new Vector3(0, mass * impulse, 0), this.boardMesh.getAbsolutePosition());
    this.jumpSettleTimer = jumpSettleDuration;
  }

  private _onEnterGliderBoost(): void {
    const { gliderLiftImpulse, gliderPitchKick, gliderDecayFactor, gliderSettleDuration } = generalConfig.boost;
    const mass = generalConfig.board.mass;

    const powerMultiplier = Math.pow(gliderDecayFactor, this.glideBoostChain);
    const impulse = mass * gliderLiftImpulse * powerMultiplier;

    this.boardAggregate.body.applyImpulse(new Vector3(0, impulse, 0), this.boardMesh.getAbsolutePosition());

    // Pitch-up momentáneo (nose up, signo negativo respecto a la picada). Sin el lerp de
    // _updateAirPitch (pendiente de portar roll/yaw/forward) esto queda fijo hasta el próximo boost.
    this.pitchAngle = -Tools.ToRadians(gliderPitchKick) * powerMultiplier;
    this.glideBoostChain++;
    this.boostSettleTimer = gliderSettleDuration;
  }

  private _applyTestImpulse(): void {
    const { downwardVelocityKick } = generalConfig.testImpulse;
    const mass = generalConfig.board.mass;
    const impulse = -mass * downwardVelocityKick;

    this.boardAggregate.body.applyImpulse(new Vector3(0, impulse, 0), this.boardMesh.getAbsolutePosition());
  }

  dispose(): void {
    this.fsm.dispose();
  }
}