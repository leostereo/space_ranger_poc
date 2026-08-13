// src/poc2-floating_board_fsm/board.controller.ts
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { poc2Config } from "./config";
import { BoardFsm } from "./board-fsm/board.fsm";
import { BoardFsmHovering } from "./board-fsm/board.fsm.hovering";
import { BoardFsmFalling } from "./board-fsm/board.fsm.falling";
import { generalConfig } from "../config.general";

/**
 * Paso 4a: física mínima, sin input todavía. Sólo raycast + hover spring-damper
 * (portado de FloatingBoardController._updateHover de POC1) + las 3 FSMs
 * transicionando automáticamente: Falling -> Hovering al detectar ground.
 * Input (roll/yaw/forward/pitch/jump/boost) llega en el Paso 4b.
 */
export class BoardController {
  readonly fsm: BoardFsm;
  readonly hoveringFsm: BoardFsmHovering;
  readonly fallingFsm: BoardFsmFalling;

  private elapsedTime = 0;
  private groundLostTimer = 0;
  private _groundDetected = false;
  private _lastGroundDistance = Infinity;

  private _ray = new Ray(Vector3.Zero(), Vector3.Down(), 100);
  private _raycastOrigin = new Vector3();

  constructor(
    private scene: Scene,
    private boardMesh: Mesh,
    private boardAggregate: PhysicsAggregate,
  ) {
    this.fsm = new BoardFsm(
      () => this._groundDetected,
      () => this.groundLostTimer,
      generalConfig.groundCheck.coyoteTime,
      () => this._onEnterHovering(),
      () => this._onEnterFalling(),
    );

    // Sin input todavía (Paso 4b): estos guards mantienen a las sub-FSMs
    // ancladas en Cruising/Gliding — nunca transicionan por su cuenta.
    this.hoveringFsm = new BoardFsmHovering(
      () => true,
      () => {},
    );

    this.fallingFsm = new BoardFsmFalling(
      () => false,
      () => true,
      () => {},
      () => {},
    );
  }

  /** Llamar en `scene.onBeforePhysicsObservable`. */
  update(): void {
    const dt = this.scene.getEngine().getDeltaTime() / 1000;
    this.elapsedTime += dt;

    this._updateGroundDetection();

    if (this._groundDetected) {
      this.groundLostTimer = 0;
    } else {
      this.groundLostTimer += dt;
    }

    this.fsm.tick();

    if (this.fsm.getState() === "Hovering") {
      this._applyHoverForce();
      this.hoveringFsm.tick();
    } else {
      this.fallingFsm.tick();
    }
  }

  /** Un solo raycast por frame; el resultado se reutiliza en _applyHoverForce. */
  private _updateGroundDetection(): void {
    const { height } = generalConfig.hover;

    this._raycastOrigin.copyFrom(this.boardMesh.absolutePosition);
    this._ray.origin.copyFrom(this._raycastOrigin);

    const hit = this.scene.pickWithRay(this._ray, (mesh) => mesh.isPickable && mesh !== this.boardMesh);
    this._lastGroundDistance = hit && hit.hit ? hit.distance : Infinity;

    // Hysteresis, igual que POC1: engancha bajo `height`, desengancha recién sobre 1.5x.
    const hoverEngagementThreshold = height * 1.5;
    if (this._lastGroundDistance <= height) {
      this._groundDetected = true;
    } else if (this._lastGroundDistance > hoverEngagementThreshold) {
      this._groundDetected = false;
    }
    // en la zona intermedia, mantiene el valor del frame anterior (sin cambio)
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

  private _onEnterHovering(): void {
    // TODO (Paso 4b): reset glideBoostChain
  }

  private _onEnterFalling(): void {}

  dispose(): void {
    this.fsm.dispose();
    this.hoveringFsm.dispose();
    this.fallingFsm.dispose();
  }
}