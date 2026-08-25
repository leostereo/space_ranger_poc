// src/poc3-jetpack_character_fsm/strategies/jetpack/jetpack.physics.controller.ts
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import { Tools } from "@babylonjs/core/Misc/tools";
import type { IPhysicsController } from "../contracts/iphysics-controller";
import type { CharacterInputState } from "../../character.input";
import type { JetpackSubState } from "../../character-fsm/character.fsm.jetpack";

const CHARACTER_MASS = 70;
const GRAVITY = 9.81;
const MAX_FUEL = 5;
const FUEL_DRAIN_RATE = 1;

const HOVER_SPRING_STRENGTH = 20;
const HOVER_DAMPING = 8;
const HOVER_MAX_FORCE_FACTOR = 8;
const THRUST_FORCE = 1400;

const BOB_AMPLITUDE = 0.15;
const BOB_FREQUENCY = 0.5;

// ── giro en "On" — yaw puro, sin roll ──
const TURN_SPEED = 2.5;
const TURN_DAMPING = 10;

// ── cruising ──
const CRUISE_FORWARD_FORCE = 2200;
const CRUISE_ROLL_ANGLE = Tools.ToRadians(35);
const CRUISE_ROLL_LERP_SPEED = 6;
const CRUISE_YAW_FROM_ROLL_FACTOR = 1.5;
const CRUISE_MAX_PITCH_ANGLE = Tools.ToRadians(40);
const CRUISE_PITCH_LERP_SPEED = 6;
const CRUISE_LATERAL_GRIP = 0.9;
const CRUISE_PITCH_FORCE = 1600; // Newtons, según intensidad de pitch — simétrico arriba/abajo (gravedad se compensa aparte, siempre)
const MAX_HOVER_CATCH_SPEED = 4; // m/s — tope de velocidad vertical que se le "perdona" al hover al retomar

export class JetpackPhysicsController implements IPhysicsController {
  private fuel = MAX_FUEL;
  private hoverTargetHeight: number;
  private elapsedTime = 0;

  // Visual (roll/pitch) — aplicado en applyVisualRoll(), llamado desde
  // onAfterPhysicsObservable en character.base.ts, nunca en tick().
  private rollAngle = 0;
  private pitchAngle = 0;

  // Vectores reutilizados, mismo criterio anti-GC que board.controller.ts (poc2).
  private _forwardReference = Vector3.Forward();
  private _forwardTemp = new Vector3();
  private _rightReference = Vector3.Right();
  private _rightTemp = new Vector3();
  private _velocityTemp = new Vector3();

  private wasCruisePitching = false;

  constructor(
    private characterAggregate: PhysicsAggregate,
    private getInput: () => CharacterInputState,
    private getSubState: () => JetpackSubState,
  ) {
    this.hoverTargetHeight = this.characterAggregate.transformNode.getAbsolutePosition().y;
  }

  tick(dt: number): void {
    this.elapsedTime += dt;

    const { up, forward, backward } = this.getInput();
    if (up && this.fuel > 0) {
      this.fuel = Math.max(0, this.fuel - dt * FUEL_DRAIN_RATE);
      this._applyThrust();
    }

    // Gravedad: SIEMPRE compensada, en todo sub-estado — separada del spring del hover
    // para que CRUISE_PITCH_FORCE sea simétrico arriba/abajo (antes, subir tenía que pagar
    // la gravedad de su propio bolsillo y bajar la recibía gratis; de ahí la asimetría).
    this._applyGravityCompensation();

    const subState = this.getSubState();

    if (subState === "Cruising") {
      this._updateCruisePitch(dt); // lerp del ángulo ANTES de decidir si hay fuerza que aplicar
    }

    const cruisePitching = subState === "Cruising" && (forward || backward);

    if (cruisePitching) {
      // Hover spring 100% apagado mientras se pitchea — mismo criterio 1:1 que poc2:
      // Hovering vs Falling son mutuamente excluyentes. Acá: el spring sólo corre si NO
      // estás empujando W/S en Cruising. La gravedad ya está compensada aparte arriba;
      // sumamos la fuerza de pitch (bidireccional) encima.
      this.hoverTargetHeight = this.characterAggregate.transformNode.getAbsolutePosition().y;
      this._applyCruisePitchForce();
      this.wasCruisePitching = true;
    } else {
      if (this.wasCruisePitching) {
        // Al soltar W/S mientras se venía rápido, no dejamos que el hover tenga que atajar
        // toda esa velocidad de un golpe con su damping — eso producía el rebote. Se
        // clampea UNA vez, en la transición, no en cada frame.
        const velocity = this.characterAggregate.body.getLinearVelocity();
        const clampedY = Scalar.Clamp(velocity.y, -MAX_HOVER_CATCH_SPEED, MAX_HOVER_CATCH_SPEED);
        this.characterAggregate.body.setLinearVelocity(new Vector3(velocity.x, clampedY, velocity.z));
        this.wasCruisePitching = false;
      }
      this._applyHoverSpringDamper();
    }

    if (subState === "Cruising") {
      this._applyCruiseForward();
      this._applyCruiseSteering(dt);
      this._applyCruiseLateralFriction();
    } else {
      this._applyTurn(dt);
      this._decayCruiseVisuals(dt); // relaja roll Y pitch a 0 al volver a "On"
    }
  }

  /** Leído por character.base.ts para armar el dep hasFuel() de CharacterFsm. */
  hasFuel(): boolean {
    return this.fuel > 0;
  }

  /** Compensación de gravedad pura — separada del spring del hover para poder desactivar
   * SÓLO la corrección de altura mientras se pitchea en Cruising, sin perder sustentación. */
  private _applyGravityCompensation(): void {
    this.characterAggregate.body.applyForce(
      new Vector3(0, CHARACTER_MASS * GRAVITY, 0),
      this.characterAggregate.transformNode.getAbsolutePosition(),
    );
  }

private _updateCruisePitch(dt: number): void {
  const { forward, backward } = this.getInput();
  let targetPitch = 0;
  // Invertido a propósito respecto al mapeo anterior — convención de palanca de vuelo:
  // W (adelante) empuja el nose hacia abajo y desciende (picar); S (atrás) levanta el
  // nose y asciende (trepar). El signo de pitchAngle sigue siendo el mismo que ya
  // maneja correctamente tanto la fuerza real como el visual — sólo se intercambia
  // qué tecla dispara cada signo.
  if (forward) targetPitch = -CRUISE_MAX_PITCH_ANGLE;
  if (backward) targetPitch = CRUISE_MAX_PITCH_ANGLE;

  const pitchLerpFactor = 1 - Math.exp(-CRUISE_PITCH_LERP_SPEED * dt);
  this.pitchAngle += (targetPitch - this.pitchAngle) * pitchLerpFactor;
}

  /**
   * Fuerza vertical — mismo patrón 1:1 que _applyDiveForce en poc2 (board.controller.ts):
   * guard por magnitud del ángulo, fuerza proporcional a la intensidad, aplicada en el
   * punto del cuerpo. Única diferencia real: acá es bidireccional (el signo de pitchAngle
   * decide arriba/abajo), porque a diferencia de la patineta el jetpack sí puede subir.
   */
  private _applyCruisePitchForce(): void {
    if (Math.abs(this.pitchAngle) <= 0.001) return;

    const pitchIntensity = this.pitchAngle / CRUISE_MAX_PITCH_ANGLE; // -1..1
    const verticalForce = CRUISE_PITCH_FORCE * pitchIntensity;

    this.characterAggregate.body.applyForce(
      new Vector3(0, verticalForce, 0),
      this.characterAggregate.transformNode.getAbsolutePosition(),
    );
  }

  private _applyThrust(): void {
    this.characterAggregate.body.applyForce(
      new Vector3(0, THRUST_FORCE, 0),
      this.characterAggregate.transformNode.getAbsolutePosition(),
    );
    this.hoverTargetHeight = this.characterAggregate.transformNode.getAbsolutePosition().y;
  }

  /** Spring-damper puro — SIN gravedad (ya se compensa aparte, siempre, en tick()). */
  private _applyHoverSpringDamper(): void {
    const currentY = this.characterAggregate.transformNode.getAbsolutePosition().y;
    const verticalVelocity = this.characterAggregate.body.getLinearVelocity().y;

    const angularFrequency = BOB_FREQUENCY * 2 * Math.PI;
    const dynamicTargetHeight = this.hoverTargetHeight + BOB_AMPLITUDE * Math.sin(this.elapsedTime * angularFrequency);

    const error = dynamicTargetHeight - currentY;
    let forceY = CHARACTER_MASS * (error * HOVER_SPRING_STRENGTH - verticalVelocity * HOVER_DAMPING);

    const maxForce = CHARACTER_MASS * GRAVITY * HOVER_MAX_FORCE_FACTOR;
    forceY = Math.max(-maxForce, Math.min(maxForce, forceY));

    this.characterAggregate.body.applyForce(
      new Vector3(0, forceY, 0),
      this.characterAggregate.transformNode.getAbsolutePosition(),
    );
  }

  /** Giro de "On": velocidad angular directa en Y, sin roll. x/z forzados a 0 cada tick
   * para garantizar cero roll/pitch pase lo que pase con el resto de las fuerzas. */
  private _applyTurn(dt: number): void {
    const { left, right } = this.getInput();
    const turnDirection = (left ? -1 : 0) + (right ? 1 : 0); // A = -Y, D = +Y (left-handed, ver nota giro invertido)
    const targetAngularVelocity = turnDirection * TURN_SPEED;

    const currentYawVelocity = this.characterAggregate.body.getAngularVelocity().y;
    const smoothedY = Scalar.Lerp(
      currentYawVelocity,
      targetAngularVelocity,
      Math.min(1, TURN_DAMPING * dt),
    );

    this.characterAggregate.body.setAngularVelocity(new Vector3(0, smoothedY, 0));
  }

  /** Empuje en la dirección forward del mesh mientras Cruising está activo. */
  private _applyCruiseForward(): void {
    Vector3.TransformNormalToRef(
      this._forwardReference,
      this.characterAggregate.transformNode.getWorldMatrix(),
      this._forwardTemp,
    );

    // Proyección horizontal: el empuje de Cruising sólo avanza en XZ. Sin esto, el tilt
    // visual del pitch (post-física) le mete una componente vertical al forward que
    // compite/cancela con _applyCruisePitchForce — mismo motivo por el que poc2 zeroea el
    // Y del forward en _computeSurfaceAlignPitch (evitar feedback loop visual<->física).
    this._forwardTemp.y = 0;
    const len = this._forwardTemp.length();
    if (len < 0.0001) return;
    this._forwardTemp.scaleInPlace(1 / len);

    this.characterAggregate.body.applyForce(
      this._forwardTemp.scale(CRUISE_FORWARD_FORCE),
      this.characterAggregate.transformNode.getAbsolutePosition(),
    );
  }

  /** Steering en Cruising: roll visual + yaw físico derivado del roll — portado de
   * _updateRollAndYaw en poc2 (board.controller.ts). */
  private _applyCruiseSteering(dt: number): void {
    const { left, right } = this.getInput();
    let targetRoll = 0;
    if (left) targetRoll += CRUISE_ROLL_ANGLE;
    if (right) targetRoll -= CRUISE_ROLL_ANGLE;

    const rollLerpFactor = 1 - Math.exp(-CRUISE_ROLL_LERP_SPEED * dt);
    this.rollAngle += (targetRoll - this.rollAngle) * rollLerpFactor;

    const yawRate = -this.rollAngle * CRUISE_YAW_FROM_ROLL_FACTOR;
    const current = this.characterAggregate.body.getAngularVelocity();
    this.characterAggregate.body.setAngularVelocity(new Vector3(current.x * 0.9, yawRate, current.z * 0.9));
  }

  /**
   * Anula la velocidad lateral (perpendicular al forward del mesh) — mismo fix que
   * _applyLateralFriction() en poc2 (board.controller.ts) para el "piso enjabonado":
   * sin esto, al girar en Cruising el momentum sigue empujando en la dirección vieja
   * mientras el mesh ya rotó, y el cuerpo desliza de costado en vez de "morder" la curva.
   */
  private _applyCruiseLateralFriction(): void {
    this.characterAggregate.body.getLinearVelocityToRef(this._velocityTemp);
    Vector3.TransformNormalToRef(
      this._rightReference,
      this.characterAggregate.transformNode.getWorldMatrix(),
      this._rightTemp,
    );

    const lateralSpeed = Vector3.Dot(this._velocityTemp, this._rightTemp);

    if (Math.abs(lateralSpeed) > 0.01) {
      const counterForce = this._rightTemp.scale(-lateralSpeed * CHARACTER_MASS * CRUISE_LATERAL_GRIP);
      this.characterAggregate.body.applyForce(
        counterForce,
        this.characterAggregate.transformNode.getAbsolutePosition(),
      );
    }
  }

  /** Relaja roll/pitch a 0 al volver a "On", para no dejar el mesh inclinado. */
  private _decayCruiseVisuals(dt: number): void {
    if (this.rollAngle === 0 && this.pitchAngle === 0) return;
    const lerpFactor = 1 - Math.exp(-CRUISE_ROLL_LERP_SPEED * dt);
    this.rollAngle += (0 - this.rollAngle) * lerpFactor;
    this.pitchAngle += (0 - this.pitchAngle) * lerpFactor;
  }

  /** 100% visual, no toca física — mismo patrón que BoardController.applyVisualRoll()
   * en poc2. Llamado desde onAfterPhysicsObservable en character.base.ts. */
  applyVisualRoll(): void {
    const node = this.characterAggregate.transformNode;
    if (!node.rotationQuaternion) return;

    const rollQuat = Quaternion.RotationAxis(Axis.Z, this.rollAngle);
    // Invertido — mismo motivo que el yaw de "On" (Babylon left-handed). El signo de
    // pitchAngle NO se toca acá: eso maneja la fuerza real y ya está correcto (W sube,
    // S baja); sólo la representación visual estaba al revés.
    const pitchQuat = Quaternion.RotationAxis(Axis.X, -this.pitchAngle);
    node.rotationQuaternion = node.rotationQuaternion.multiply(rollQuat.multiply(pitchQuat));
  }

  dispose(): void {
    // No posee characterAggregate (compartida, dueño: character.base.ts) — nada que liberar acá todavía.
  }
}