// src/poc2-floating_board_fsm/board.controller.ts
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Tools } from "@babylonjs/core/Misc/tools";

import { BoardFsm } from "./board-fsm/board.fsm";
import { generalConfig } from "../config.general";

/**
 * Paso 4b (en progreso): guards/acciones reales de jump/boost/hover, portadas
 * de FloatingBoardController (POC1). Roll/yaw/forward/pitchDown dependen de
 * board.input.ts, que todavía no existe — hasta entonces isPitchDownHeld
 * queda fijo en false (Diving nunca se dispara, pero el guard ya está armado).
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
  // Usado sólo por la fuerza de picado (Diving) por ahora — el lerp visual/continuo
  // de _updateAirPitch (POC1) llega recién con board.input.ts.
  private pitchAngle = 0;

  private _ray = new Ray(Vector3.Zero(), Vector3.Down(), 100);
  private _raycastOrigin = new Vector3();

  constructor(
    private scene: Scene,
    private boardMesh: Mesh,
    private boardAggregate: PhysicsAggregate,
  ) {
    this.fsm = new BoardFsm({
      isGroundDetected: () => this._groundDetected,
      groundLostElapsed: () => this.groundLostTimer,
      coyoteTime: generalConfig.groundCheck.coyoteTime,
      onEnterHovering: () => this._onEnterHovering(),
      onEnterFalling: () => {},

      isJumpSettled: () => this.jumpSettleTimer <= 0,
      onEnterJumping: () => this._onEnterJumping(),

      isPitchDownHeld: () => false, // TODO: board.input.ts (Paso 4b, input)
      isBoostSettled: () => this.boostSettleTimer <= 0,
      onEnterDiving: () => {},
      onEnterGliderBoost: () => this._onEnterGliderBoost(),
    });
  }

  /** Llamar en `scene.onBeforePhysicsObservable`. */
  update(): void {
    const dt = this.scene.getEngine().getDeltaTime() / 1000;
    this.elapsedTime += dt;

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
  }

  /** Llamar desde el input handler cuando se consume el request de Space (pendiente de board.input.ts). */
  handleJumpInput(): void {
    this.fsm.requestJump();
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
    // _updateAirPitch (pendiente en board.input.ts) esto queda fijo hasta el próximo boost.
    this.pitchAngle = -Tools.ToRadians(gliderPitchKick) * powerMultiplier;
    this.glideBoostChain++;
    this.boostSettleTimer = gliderSettleDuration;
  }

  dispose(): void {
    this.fsm.dispose();
  }
}