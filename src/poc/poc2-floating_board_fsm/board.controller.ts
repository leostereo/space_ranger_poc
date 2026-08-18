// src/poc2-floating_board_fsm/board.controller.ts
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import { Tools } from "@babylonjs/core/Misc/tools";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";

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

  // Telemetría para el HUD (comparar caídas) — se actualiza en onAfterPhysicsObservable
  private previousVerticalVelocity = 0;
  private verticalVelocity = 0;
  private verticalAcceleration = 0;
  private forwardSpeedTelemetry = 0;

  private _ray = new Ray(Vector3.Zero(), Vector3.Down(), 100);
  private _raycastOrigin = new Vector3();

  // Vectores reutilizados para evitar Garbage Collection en cada frame
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
      onEnterFalling: () => { },

      isJumpSettled: () => this.jumpSettleTimer <= 0,
      onEnterJumping: () => this._onEnterJumping(),
      isForwardHeld: () => this.input.current.forward,

      isPitchDownHeld: () => this.input.current.pitchDown,
      isBoostSettled: () => this.boostSettleTimer <= 0,
      onEnterDiving: () => { },
      onEnterGliderBoost: () => this._onEnterGliderBoost(),
      getForwardSpeed: () => this._currentForwardSpeed,

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

    this._updateCurrentForwardSpeed(); // 👈 antes del tick
    this.fsm.tick();

    const currentMacroState = this.fsm.getState();
    const currentSubState = this.fsm.getActiveSubState();

    if (currentMacroState === "Hovering") {
      this._applyHoverForce();
    } else {
      // =========================================================================
      // GESTIÓN DE FUERZAS VERTICALES EN EL AIRE (FALLING)
      // =========================================================================
      if (currentSubState === "Diving") {
        // CASO 3: Caída en picada (Fuerza hacia abajo)
        this._applyDiveForce();
      }
      else if (currentSubState === "Gliding") {
        // ✨ CASO 2: Cayendo PERO CON fuerza de empuje activa (Planeo/Lift del motor)
        this._applyGlidingLiftForce();
      }
      // NOTA: Si el sub-estado es "Dropping" o "GliderBoost", no aplicamos fuerzas continuas extras en Y.
      // En "Dropping" (CASO 1) Havok actúa de forma natural logrando la caída muerta que buscabas.
    }

    this._updateRollAndYaw(dt);
    this._updateForwardForce();
    this._applyLateralFriction();
    this._updatePitch(dt);

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

  /** Llamar en `scene.onAfterPhysicsObservable`, junto con applyVisualRoll. Para el HUD (comparar caídas). */
  updateTelemetry(): void {
    const dt = this.scene.getEngine().getDeltaTime() / 1000;

    this.verticalVelocity = this.boardAggregate.body.getLinearVelocity().y;
    this.verticalAcceleration = dt > 0 ? (this.verticalVelocity - this.previousVerticalVelocity) / dt : 0;
    this.previousVerticalVelocity = this.verticalVelocity;

    Vector3.TransformNormalToRef(this._forwardReference, this.boardMesh.getWorldMatrix(), this._forwardTemp);

    // Obtenemos la velocidad lineal del cuerpo físico
    this.boardAggregate.body.getLinearVelocityToRef(this._velocityTemp);

    // Proyectamos la velocidad sobre el vector forward usando producto punto
    this.forwardSpeedTelemetry = Vector3.Dot(this._velocityTemp, this._forwardTemp);

  }

  getVerticalVelocity(): number {
    return this.verticalVelocity;
  }

  getVerticalAcceleration(): number {
    return this.verticalAcceleration;
  }

  getForwardSpeed(): number {
    return this.forwardSpeedTelemetry;
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

    if (hit && hit.hit) {
      const normal = hit.getNormal(true, false); // world space, face normal (no interpolación de vértices)
      if (normal) this._lastGroundNormal.copyFrom(normal);
    }

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
  private _updatePitch(dt: number): void {
    const macroState = this.fsm.getState();
    const { maxPitchAngle: maxPitchAngleDeg, pitchLerpSpeed, surfaceAlignLerpSpeed } = generalConfig.movement;
    const maxPitchAngle = Tools.ToRadians(maxPitchAngleDeg);

    let targetPitch = 0;
    let lerpSpeed = pitchLerpSpeed;

    if (macroState === "Falling") {
      const { pitchDown } = this.input.current;
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

    // Proyección horizontal del forward (ignora cualquier pitch visual ya aplicado, evita feedback).
    this._forwardTemp.y = 0;
    const len = this._forwardTemp.length();
    if (len < 0.0001) return this.pitchAngle; // sin dirección clara (parado quieto): mantiene el valor actual

    this._forwardTemp.scaleInPlace(1 / len);

    const nUp = Vector3.Dot(this._lastGroundNormal, Vector3.Up());
    const nForward = Vector3.Dot(this._lastGroundNormal, this._forwardTemp);

    const raw = Math.atan2(nForward, nUp);

    // Clamp de seguridad: evita valores extremos si el raycast pega en un borde/esquina raro.
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

  private _onEnterHovering(): void {
    this.glideBoostChain = 0;
  }

  private _updateRollAndYaw(dt: number): void {
    const { turnLeft, turnRight } = this.input.current;
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

  private _onEnterJumping(): void {
    const { jumpSettleDuration, impulse } = generalConfig.boost;
    const mass = generalConfig.board.mass;

    this.boardAggregate.body.applyImpulse(new Vector3(0, mass * impulse, 0), this.boardMesh.getAbsolutePosition());
    this.jumpSettleTimer = jumpSettleDuration;
  }

  /**
   * Aplica sustentación aerodinámica artificial cuando la patineta avanza en el aire con motor activo.
   * (Equivale a tu Punto 2: cayendo pero con fuerza de empuje).
   */
  private _applyGlidingLiftForce(): void {
    const mass = generalConfig.board.mass;
    const glideFactor = 0.08; // Si querés, podés pasar este valor a generalConfig.movement más adelante

    // Obtenemos la velocidad lineal actual desde Havok usando la referencia optimizada
    this.boardAggregate.body.getLinearVelocityToRef(this._velocityTemp);
    const fallSpeed = this._velocityTemp.y;

    // Solo planea si efectivamente está perdiendo altura (yendo hacia abajo)
    if (fallSpeed < 0) {
      // Calculamos la velocidad horizontal pura ignorando el eje Y
      const horizontalVelocity = new Vector3(this._velocityTemp.x, 0, this._velocityTemp.z);
      const forwardSpeed = horizontalVelocity.length();

      // Evitamos aplicar fuerzas si está prácticamente quieto en el aire
      if (forwardSpeed > 1) {
        // Tu fórmula matemática exacta de la POC1
        let liftAmount = mass * forwardSpeed * Math.abs(fallSpeed) * glideFactor;

        // Limitar el planeo para que nunca supere el 95% de la gravedad total (así no flota indefinidamente)
        const maxLiftLimit = mass * 9.81 * 0.95;
        if (liftAmount > maxLiftLimit) {
          liftAmount = maxLiftLimit;
        }

        // Aplicamos la fuerza de sustentación hacia arriba en el eje Y del mundo
        this.boardAggregate.body.applyForce(
          new Vector3(0, liftAmount, 0),
          this.boardMesh.getAbsolutePosition()
        );
      }
    }
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