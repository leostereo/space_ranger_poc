import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import { Ray } from "@babylonjs/core/Culling/ray";
import type { PickingInfo } from "@babylonjs/core/Collisions/pickingInfo";
import {
  CHARACTER_CAPSULE_BOTTOM_POINT,
  CHARACTER_CAPSULE_RADIUS,
  CHARACTER_CAPSULE_STANDING_TOP_POINT,
} from "../../character.constants";import type { IPhysicsController } from "../contracts/iphysics-controller";
import type { CharacterInputState } from "../../character.input";
import { PhysicsShapeCapsule } from "@babylonjs/core";
import { OnGroundSubState } from "../../character-fsm/standAlone-fsm/character.fsm.stand-alone.on-ground";
import { OnGroundCrouchedSubState } from "../../character-fsm/standAlone-fsm/character.fsm.stand-alone.on-ground-crouched"; // NUEVO
import { isShieldActive } from "../../utils/combat-rules";

const WALK_SPEED = 4;
const RUN_SPEED = 7;
const TURN_SPEED = Math.PI; // velocidad máxima de giro (rad/s)
const TURN_SPEED_MIN_FACTOR = 0.2; // un toque corto arranca al 20% de la velocidad máxima: gira muy poco
const TURN_RAMP_SECONDS = 0.4; // tiempo manteniendo la tecla hasta llegar a la velocidad máxima
const AIM_TURN_FACTOR = 0.4; // al disparar, el giro máximo baja a este porcentaje (puntería fina)
const GROUND_FRICTION = 0.8;
const GROUND_RESTITUTION = 0;
const GROUND_RAY_MARGIN = 0.15;
const MIN_WALKABLE_NORMAL_Y = 0.5; // cos(60°): más empinado que esto no se sigue la pendiente
const GROUND_STICK_SPEED = 0.5; // pequeño empuje hacia el suelo para no despegarse en bajadas y cambios de pendiente (0 = apagado)
const GROUND_NORMAL_SMOOTHING = 0.3; // 0 a 1: cuánto sigue la normal nueva (suaviza los saltos entre triángulos)
const UPWARD_VELOCITY_THRESHOLD = 0.5;
const GROUND_COYOTE_TIME_SECONDS = 0.15 // tolerancia si el rayo falla un instante (bordes de triángulos, microrrebotes)
const JUMP_IMPULSE = 10;
const ROLL_INITIAL_SPEED = 8; // m/s, ajustar a gusto
const ROLL_MAX_DURATION_SECONDS = 1.2; // safety net si notifyLandingRollEnd() nunca llega
const CROUCH_ROLL_SPEED = 10; // NUEVO — ajustar a gusto
const CROUCH_ROLL_DURATION_SECONDS = 2.83;
const JUMP_WINDUP_DAMPING_RATE = 8; // más alto = frena más rápido
const HIT_STUN_DAMPING_RATE = 10; // NUEVO — frena rápido pero no en seco, ajustar a gusto
const DEATH_DAMPING_RATE = 6; // NUEVO — ajustar a gusto
const RUNNING_JUMP_VERTICAL_IMPULSE = 4; // más bajo que JUMP_IMPULSE (10) — trayectoria más chata
const RUNNING_JUMP_FORWARD_BOOST = 8;    // más alto que antes (6) — más alcance para cruzar el hueco
const WALK_BACKWARD_SPEED = 2; // más lento que WALK_SPEED (4) — retroceder es más cauto que avanzar
const STRAFE_SPEED = 2.2; // más lento que WALK_SPEED (4) — strafe táctico
const CAPSULE_RADIUS = CHARACTER_CAPSULE_RADIUS;
const CAPSULE_BOTTOM = CHARACTER_CAPSULE_BOTTOM_POINT;
const CAPSULE_STANDING_TOP = CHARACTER_CAPSULE_STANDING_TOP_POINT;
const CAPSULE_CROUCH_TOP = 0.1;


export class StandAlonePhysicsController implements IPhysicsController {
  private _groundDetected = true;
  private _groundGraceRemaining = 0; // cuánto falta para dar por perdido el suelo cuando el rayo falla
  private _groundNormal = Vector3.Up(); // normal del suelo bajo el personaje (suavizada)
  private _isCrouched = false; // NUEVO
  private _ray = new Ray(Vector3.Zero(), Vector3.Down(), 5);
  private _isRolling = false;
  private _rollElapsed = 0;
  private _rollDirection = Vector3.Zero();
  private _rollSpeed = ROLL_INITIAL_SPEED;
  private _rollDuration = ROLL_MAX_DURATION_SECONDS;
  private _lastImpactVerticalSpeed = 0;
  private _lastImpactHorizontalSpeed = 0;
  private _isWindingUpJump = false;
  private _turnHeldSeconds = 0; // cuánto lleva sostenido el giro actual (para la rampa de velocidad)
  private _lastTurnDirection = 0;
  private _isHitStunned = false; // NUEVO
  private _isDead = false; // NUEVO
  private _diedInAir = false; // NUEVO — murió sin tocar el piso: falta avisar el aterrizaje
  private _onDeadLanded: (() => void) | null = null; // NUEVO

  constructor(
    private scene: Scene,
    private characterAggregate: PhysicsAggregate,
    private getInput: () => CharacterInputState,
    initialGroundDetected: boolean,
    private getSubState: () => OnGroundSubState | OnGroundCrouchedSubState | "JumpImpulseStart" | "RunningJumpImpulseStart" | "OnAir" | "CrouchRollStart",
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
    const wasGrounded = this._groundDetected;
    this._updateGroundDetection(dt);

    if (!wasGrounded && this._groundDetected) {
      const v = this.characterAggregate.body.getLinearVelocity();
      this._lastImpactVerticalSpeed = v.y;
      this._lastImpactHorizontalSpeed = Math.sqrt(v.x ** 2 + v.z ** 2);

      // NUEVO — murió en el aire y recién toca el piso: avisa una sola vez (cambia el clip)
      if (this._isDead && this._diedInAir) {
        this._diedInAir = false;
        this._onDeadLanded?.();
      }
    }

    // NUEVO — muerte: en el aire sigue su trayectoria (cae por gravedad, sin frenar la horizontal);
    // apoyado en el piso frena. En ambos casos corta el giro residual.
    if (this._isDead) {
      if (this._groundDetected) this._applyHorizontalDamping(dt, DEATH_DAMPING_RATE);
      this.characterAggregate.body.setAngularVelocity(Vector3.Zero());
      return;
    }

    // NUEVO — reacción al hit (sólo en suelo): frena la velocidad horizontal y corta el giro residual
    if (this._isHitStunned) {
      this._applyHorizontalDamping(dt, HIT_STUN_DAMPING_RATE);
      this.characterAggregate.body.setAngularVelocity(Vector3.Zero());
      return;
    }

    if (this._isWindingUpJump) {
      this._applyHorizontalDamping(dt, JUMP_WINDUP_DAMPING_RATE); // CAMBIADO — antes _applyJumpWindupDamping(dt)
      return;
    }

    if (this._isRolling) {
      this._tickRoll(dt);
      return;
    }

    // ── desde acá es lo que cambia ──────────────────────────────────────

    const input = this.getInput();
    const subState = this.getSubState();

    if (subState === "ShootingStrafeLeft" || subState === "ShootingStrafeRight") {
      this._applyStrafe(subState === "ShootingStrafeLeft" ? -1 : 1);
      return;
    }

    // NUEVO — bloque del escudo (el que preguntás)
    if (isShieldActive(subState, input)) {
      const strafeDir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const canStrafeNow = !input.forward && !input.backward && subState !== "CrouchIdle";
      if (strafeDir !== 0 && canStrafeNow) {
        this._applyStrafe(strafeDir as -1 | 1);
        return;
      }
      this.characterAggregate.body.setAngularVelocity(Vector3.Zero());
      this._applyMove(input.forward, input.backward, false);
      return;
    }

    // flujo normal (sin escudo)
    this._applyTurn(input.left, input.right, dt, input.shoot);
    this._applyMove(input.forward, input.backward, input.cruise);
  }

  /** CAMBIADO — antes _applyJumpWindupDamping: ahora recibe la tasa para reusarlo en windup, hit stun y muerte. */
  private _applyHorizontalDamping(dt: number, rate: number): void {
    const currentVelocity = this.characterAggregate.body.getLinearVelocity();
    const dampingFactor = Math.exp(-rate * dt);

    this.characterAggregate.body.setLinearVelocity(
      new Vector3(
        currentVelocity.x * dampingFactor,
        currentVelocity.y,
        currentVelocity.z * dampingFactor,
      ),
    );
  }

  /** Decae ROLL_INITIAL_SPEED -> 0 mientras dure el roll, en la dirección capturada al entrar. */
  private _tickRoll(dt: number): void {
    this._rollElapsed += dt;
    const t = Math.min(this._rollElapsed / this._rollDuration, 1); // CAMBIADO
    const currentSpeed = Scalar.Lerp(this._rollSpeed, 0, t); // CAMBIADO
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

  /**
   * Giro con rampa: arranca lento y acelera mientras se mantiene la tecla, así un toque corto da un ajuste fino
   * y mantener apretado sigue girando rápido. Al disparar el máximo baja (puntería fina).
   */
  private _applyTurn(left: boolean, right: boolean, dt: number, aiming: boolean): void {
    const turnDir = (right ? 1 : 0) - (left ? 1 : 0);

    if (turnDir === 0 || turnDir !== this._lastTurnDirection) {
      this._turnHeldSeconds = 0; // soltó o cambió de sentido: vuelve a arrancar lento
    }
    this._lastTurnDirection = turnDir;
    if (turnDir !== 0) {
      this._turnHeldSeconds += dt;
    }

    const ramp = Math.min(this._turnHeldSeconds / TURN_RAMP_SECONDS, 1);
    const maxSpeed = aiming ? TURN_SPEED * AIM_TURN_FACTOR : TURN_SPEED;
    const speed = Scalar.Lerp(maxSpeed * TURN_SPEED_MIN_FACTOR, maxSpeed, ramp);

    this.characterAggregate.body.setAngularVelocity(new Vector3(0, turnDir * speed, 0));
  }

  private _applyMove(forward: boolean, backward: boolean, cruise: boolean): void {
    const currentVelocity = this.characterAggregate.body.getLinearVelocity();
    const verticalVelocity = this._groundDetected ? 0 : currentVelocity.y;

    if (!forward && !backward) {
      if (!this._groundDetected) return;
      this.characterAggregate.body.setLinearVelocity(new Vector3(0, verticalVelocity, 0));
      return;
    }

    const dirSign = (forward ? 1 : 0) - (backward ? 1 : 0);
    const facing = this.characterAggregate.transformNode.forward.scale(dirSign);

    // NUEVO: retroceder siempre va a WALK_BACKWARD_SPEED, sin importar Shift — no existe
    // "correr hacia atrás". Si ambas se sostienen a la vez, dirSign da 0 (se cancelan),
    // así que esta rama no importa en ese caso — no hay desplazamiento de todas formas.
    const isMovingBackwardOnly = backward && !forward;
    const speed = isMovingBackwardOnly ? WALK_BACKWARD_SPEED : (cruise ? RUN_SPEED : WALK_SPEED);

    const velocityX = facing.x * speed;
    const velocityZ = facing.z * speed;
    this.characterAggregate.body.setLinearVelocity(
      this._groundDetected
        ? this._followGround(velocityX, velocityZ)
        : new Vector3(velocityX, verticalVelocity, velocityZ),
    );
  }

  /** Traslada lateralmente sin tocar la rotación — dirSign: -1 = izquierda, 1 = derecha.
 * Usa el `right` del transform, no un giro, así el personaje sigue mirando al frente
 * mientras se desplaza de costado (a diferencia de _applyTurn, que rota el modelo). */
  private _applyStrafe(dirSign: -1 | 1): void {
    const currentVelocity = this.characterAggregate.body.getLinearVelocity();
    const verticalVelocity = this._groundDetected ? 0 : currentVelocity.y;
    const right = this.characterAggregate.transformNode.right.scale(dirSign);

    this.characterAggregate.body.setAngularVelocity(Vector3.Zero()); // NUEVO — sin esto, el giro residual de _applyTurn() sigue girando indefinidamente
    const strafeX = right.x * STRAFE_SPEED;
    const strafeZ = right.z * STRAFE_SPEED;
    this.characterAggregate.body.setLinearVelocity(
      this._groundDetected
        ? this._followGround(strafeX, strafeZ)
        : new Vector3(strafeX, verticalVelocity, strafeZ),
    );
  }

  /** Suma un boost horizontal extra en la dirección hacia donde mira el personaje,
   * ENCIMA de la velocidad de carrera que ya trae (no la pisa como applyJumpImpulse). */
  applyRunningJumpImpulse(): void {
    this._groundDetected = false; // salto explícito
    this._groundGraceRemaining = 0;
    const currentVelocity = this.characterAggregate.body.getLinearVelocity();
    const forward = this.characterAggregate.transformNode.forward;

    this.characterAggregate.body.setLinearVelocity(
      new Vector3(
        currentVelocity.x + forward.x * RUNNING_JUMP_FORWARD_BOOST,
        RUNNING_JUMP_VERTICAL_IMPULSE,
        currentVelocity.z + forward.z * RUNNING_JUMP_FORWARD_BOOST,
      ),
    );
  }

  /** Normal de la cara del suelo (mirando hacia arriba), suavizada entre frames. */
  private _updateGroundNormal(hit: PickingInfo): void {
    // Normal de la cara: las de los vértices se promedian en los bordes de la malla y quedan inclinadas.
    const normal = hit.getNormal(true, false);
    if (!normal) {
      return;
    }
    if (normal.y < 0) {
      normal.scaleInPlace(-1); // algunas mallas tienen las caras al revés
    }
    Vector3.LerpToRef(this._groundNormal, normal, GROUND_NORMAL_SMOOTHING, this._groundNormal);
    this._groundNormal.normalize();
  }

  /**
   * Velocidad apoyado: conserva la componente horizontal y suma la vertical que deja el movimiento
   * sobre el plano del suelo (en una bajada es negativa, así el personaje acompaña la pendiente).
   */
  private _followGround(horizontalX: number, horizontalZ: number): Vector3 {
    const normal = this._groundNormal;
    if (normal.y < MIN_WALKABLE_NORMAL_Y) {
      return new Vector3(horizontalX, 0, horizontalZ);
    }
    const slopeY = -(normal.x * horizontalX + normal.z * horizontalZ) / normal.y;
    return new Vector3(horizontalX, slopeY - GROUND_STICK_SPEED, horizontalZ);
  }

  isGroundDetected(): boolean {
    return this._groundDetected;
  }

  applyJumpImpulse(): void {
    // Entrar a OnAir también ocurre al perder el suelo sin saltar (borde, rebote): ahí no hay impulso.
    if (!this._groundDetected) {
      return;
    }
    this._groundDetected = false; // salto explícito: deja de estar apoyado (subir una rampa no cuenta como salto)
    this._groundGraceRemaining = 0;
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

    this._rollSpeed = ROLL_INITIAL_SPEED; // NUEVO
    this._rollDuration = ROLL_MAX_DURATION_SECONDS; // NUEVO
    this._isRolling = true;
    this._rollElapsed = 0;
  }

  /** Llamado cuando el AnimationEvent de landing-roll llega al frame final. */
  notifyLandingRollEnd(): void {
    this._isRolling = false;
  }

  notifyCrouchRollStart(): void { // NUEVO
    this._rollDirection = this.characterAggregate.transformNode.forward.clone();
    this._rollSpeed = CROUCH_ROLL_SPEED;
    this._rollDuration = CROUCH_ROLL_DURATION_SECONDS;
    this._isRolling = true;
    this._rollElapsed = 0;
  }

  /** Llamado al salir de CrouchRollStart (por notifyCrouchRollComplete() vía animación). */
  notifyCrouchRollEnd(): void { // NUEVO
    this._isRolling = false;
  }

  private _updateGroundDetection(dt: number): void {
    const topY = this._isCrouched ? CAPSULE_CROUCH_TOP : CAPSULE_STANDING_TOP; // CAMBIADO
    const halfHeight = (topY - CAPSULE_BOTTOM) / 2; // CAMBIADO
    const rayLength = halfHeight + GROUND_RAY_MARGIN; // CAMBIADO — antes: generalConfig.playerConfig.height / 2 + GROUND_RAY_MARGIN

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
    const rayHit = !!(hit && hit.hit);
    if (hit && rayHit) {
      this._updateGroundNormal(hit);
    }

    if (this._groundDetected) {
      // Apoyado: sigue apoyado mientras el rayo toque el suelo, aunque suba (rampas).
      // Si el rayo falla un instante se tolera GROUND_COYOTE_TIME_SECONDS antes de darlo por perdido.
      if (rayHit) {
        this._groundGraceRemaining = GROUND_COYOTE_TIME_SECONDS;
      } else {
        this._groundGraceRemaining -= dt;
        if (this._groundGraceRemaining <= 0) {
          this._groundDetected = false;
        }
      }
      return;
    }

    // En el aire: toca el piso solo si el rayo lo ve y no está subiendo (si no, es el tramo ascendente de un salto).
    if (rayHit && !isMovingUpward) {
      this._groundDetected = true;
      this._groundGraceRemaining = GROUND_COYOTE_TIME_SECONDS;
    }
  }

  /** Llamado al entrar a Crouch (StandAloneFsm.onEnter). */
  notifyCrouchEnter(): void {
    console.log("crouch enter called"); // TEMPORAL
    this._isCrouched = true;
    this._applyCapsuleShape(CAPSULE_CROUCH_TOP);
  }

  /** Llamado al salir de Crouch (StandAloneFsm.onExit). */
  notifyCrouchExit(): void { // NUEVO
    this._isCrouched = false;
    this._applyCapsuleShape(CAPSULE_STANDING_TOP);
  }

  private _applyCapsuleShape(topY: number): void {
    const pointA = new Vector3(0, CAPSULE_BOTTOM, 0);
    const pointB = new Vector3(0, topY, 0);
    const newShape = new PhysicsShapeCapsule(pointA, pointB, CAPSULE_RADIUS, this.scene);
    this.characterAggregate.shape = newShape;
    // this.characterAggregate.body.shape = newShape; // NUEVO
  }

  getLastImpactVerticalSpeed(): number {
    return this._lastImpactVerticalSpeed;
  }

  getLastImpactHorizontalSpeed(): number {
    return this._lastImpactHorizontalSpeed;
  }

  notifyJumpWindupStart(): void {
    this._isWindingUpJump = true;
  }

  notifyJumpWindupEnd(): void {
    this._isWindingUpJump = false;
  }

  /** NUEVO — empieza el stun de la reacción al hit (freno horizontal). */
  notifyHitStunStart(): void {
    this._isHitStunned = true;
  }

  /** NUEVO — termina el stun, vuelve el control normal. */
  notifyHitStunEnd(): void {
    this._isHitStunned = false;
  }

  /**
   * NUEVO — muerte: frena y ya no responde al input.
   * Si muere en el aire (sin piso detectado), llama a onLanded una sola vez cuando toque el piso.
   */
  notifyDead(onLanded?: () => void): void {
    this._isDead = true;
    this._diedInAir = !this._groundDetected;
    this._onDeadLanded = onLanded ?? null;
  }

  dispose(): void { }
}