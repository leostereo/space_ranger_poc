import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Axis } from "@babylonjs/core/Maths/math.axis";

import { poc1Config } from "./config";
import type { BoardInput } from "./board-input";
import { Ray, Tools } from "@babylonjs/core";

/**
 * Controller de física del board flotante adaptado.
 */
export class FloatingBoardController {
  private elapsedTime = 0;
  private isHovering = false;
  private rollAngle = 0; // radianes, ángulo de banco visual actual
  private pitchAngle = 0;

  // Reutilización de vectores en memoria para evitar Garbage Collection en cada frame
  private _forwardReference = Vector3.Forward(); // Vector estático de referencia (0,0,1)
  private _forwardTemp = new Vector3();
  private _rightReference = Vector3.Right(); // Vector estático (1,0,0)
  private _rightTemp = new Vector3();        // Contenedor para el eje lateral del mundo
  private _velocityTemp = new Vector3();
  private _forwardVelocityTemp = new Vector3();
  private _ray = new Ray(Vector3.Zero(), Vector3.Up().scaleInPlace(-1), 10);
  private _raycastPositionTemp = new Vector3();
  private _debugTimer = 0;
  private _airPitchVectorTemp = new Vector3();

  constructor(
    private scene: Scene,
    private boardMesh: Mesh,
    private boardAggregate: PhysicsAggregate,
    private input: BoardInput,

  ) {
    if (!this.boardMesh.rotationQuaternion) {
      this.boardMesh.rotationQuaternion = Quaternion.Identity();
    }
  }

  /** Se llama en `scene.onBeforePhysicsObservable` */
  update(): void {
    const dt = this.scene.getEngine().getDeltaTime() / 1000;
    this.elapsedTime += dt;

  // ✨ TRUCO DE SINCRO: Forzamos al mesh a sincronizar su matriz con la posición real del body físico de Havok,
  // eliminando el residuo estético del applyVisualRoll del frame anterior.
  this.boardMesh.computeWorldMatrix(true);

  this._updateHover();
  this._updateRollAndYaw(dt);
  this._updateForwardForce();
  this._applyLateralFriction();
  this._updateAirPitch(dt); 
  this._updateJump();
  this._updateTestImpulse();
}

applyVisualRoll(): void {
  const rollQuat = Quaternion.RotationAxis(Axis.Z, -this.rollAngle);
  const pitchQuat = Quaternion.RotationAxis(Axis.X, this.pitchAngle);

  const visualOffset = rollQuat.multiply(pitchQuat); // probá el orden inverso si se ve raro
  this.boardMesh.rotationQuaternion = this.boardMesh.rotationQuaternion!.multiply(visualOffset);
}

  private _updateHover(): void {
    const { height, springStrength, damping, bobAmplitude, bobFrequency } = poc1Config.hover;
    const mass = poc1Config.board.mass;

  // 1. CONFIGURAR ORIGEN DEL RAYO
  this._raycastPositionTemp.copyFrom(this.boardMesh.absolutePosition);

  const thicknessOffset = poc1Config.board.height * 0.5 + 0.05;
  this._ray.origin.set(
    this._raycastPositionTemp.x,
    this._raycastPositionTemp.y - thicknessOffset,
    this._raycastPositionTemp.z
  );

  this._ray.length = 100;

  // 2. LANZAR RAYO
  const hit = this.scene.pickWithRay(this._ray, (mesh) => {
    return mesh.isPickable && mesh !== this.boardMesh && mesh.parent !== this.boardMesh;
  }); 

  const actualDistanceToGround = (hit && hit.hit) ? (hit.distance + thicknessOffset) : 999;

  // =========================================================================
  // ✨ SISTEMA DE HISTÉRESIS (ZONA DE TOLERANCIA ANTI-PARPADEO)
  // =========================================================================
  // Definimos un "techo" de enganche más alto que la altura de flotación normal.
  // Si la altura ideal es 1.2, permitimos que el resorte actúe hasta 1.8 metros del suelo.
  const hoverEngagementThreshold = height * 1.5;

  let shouldHover = this.isHovering; // Por defecto, mantiene el estado anterior

  if (hit && hit.hit) {
    if (actualDistanceToGround <= height) {
      // Si se hunde por debajo de la altura ideal, SE ENGANCHA obligatoriamente al piso
      shouldHover = true;
    } else if (actualDistanceToGround > hoverEngagementThreshold) {
      // SÓLO se desengancha y pasa a modo AIRE si supera el límite de tolerancia (se despegó de verdad)
      shouldHover = false;
    }
  } else {
    // Si el rayo ni siquiera toca el suelo, está en el aire de forma definitiva
    shouldHover = false;
  }

  this.isHovering = shouldHover;

  // Forzamos la gravedad nativa de Havok siempre al 100%
  this.boardAggregate.body.setGravityFactor(1);

  // =========================================================================
  // CASO A: LA PATINETA ESTÁ EN EL AIRE (Caída o Planeo)
  // =========================================================================
  if (!this.isHovering) {
    this.boardAggregate.body.getLinearVelocityToRef(this._velocityTemp);

    const horizontalVelocity = new Vector3(this._velocityTemp.x, 0, this._velocityTemp.z);
    const forwardSpeed = horizontalVelocity.length();
    const fallSpeed = this._velocityTemp.y;

    if (fallSpeed < 0 && forwardSpeed > 1) {
      const glideFactor = 0.08;
      let liftAmount = mass * forwardSpeed * Math.abs(fallSpeed) * glideFactor;

      const maxLiftLimit = mass * 9.81 * 0.95;
      if (liftAmount > maxLiftLimit) {
        liftAmount = maxLiftLimit;
      }

      this.boardAggregate.body.applyForce(
        new Vector3(0, liftAmount, 0),
        this._raycastPositionTemp
      );
    }
    return;
  }

  // =========================================================================
  // CASO B: LA PATINETA ESTÁ EN TIERRA (Resorte Magnético)
  // =========================================================================
  const angularFrequency = bobFrequency * 2 * Math.PI;
  const dynamicTargetHeight = height + bobAmplitude * Math.sin(this.elapsedTime * angularFrequency);

  const error = dynamicTargetHeight - actualDistanceToGround;
  const verticalVelocity = this.boardAggregate.body.getLinearVelocity().y;

  let finalForceY = mass * (error * springStrength - verticalVelocity * damping);
  const gravityCompensation = mass * 9.81;
  finalForceY += gravityCompensation;

  if (finalForceY < 0) finalForceY = 0;

  const maxForceLimit = mass * 9.81 * 8;
  if (finalForceY > maxForceLimit) finalForceY = maxForceLimit;

  this.boardAggregate.body.applyForce(
    new Vector3(0, finalForceY, 0),
    this._raycastPositionTemp
  );
}

  private _updateRollAndYaw(dt: number): void {
    const { turnLeft, turnRight } = this.input.current;
    const { maxRollAngle, rollLerpSpeed, yawFromRollFactor } = poc1Config.movement;

    let targetRoll = 0;
    if (turnLeft) targetRoll -= maxRollAngle;
    if (turnRight) targetRoll += maxRollAngle;

    const lerpFactor = 1 - Math.exp(-rollLerpSpeed * dt);
    this.rollAngle += (targetRoll - this.rollAngle) * lerpFactor;

    const yawRate = -this.rollAngle * yawFromRollFactor;
    const current = this.boardAggregate.body.getAngularVelocity();

    // Forzamos la velocidad angular en Y. Mantenemos X y Z controlados para evitar que vuelque físicamente
    this.boardAggregate.body.setAngularVelocity(new Vector3(current.x * 0.9, yawRate, current.z * 0.9));
  }

private _updateAirPitch(dt: number): void {
  const isPlaneando = !this.isHovering;
  const { pitchDown } = this.input.current;
  const { pitchLerpSpeed, pitchDiveAcceleration } = poc1Config.movement;
  const maxPitchAngle = Tools.ToRadians(poc1Config.movement.maxPitchAngle);

  const targetPitch = (isPlaneando && pitchDown) ? maxPitchAngle : 0;

  const lerpFactor = 1 - Math.exp(-pitchLerpSpeed * dt);
  this.pitchAngle += (targetPitch - this.pitchAngle) * lerpFactor;

  // --- Física del picado ---
  if (isPlaneando && this.pitchAngle > 0.001) {
    const diveIntensity = this.pitchAngle / maxPitchAngle; // 0 a 1
    const mass = poc1Config.board.mass;
    const diveForce = mass * pitchDiveAcceleration * diveIntensity;

    this.boardAggregate.body.applyForce(
      new Vector3(0, -diveForce, 0),
      this.boardMesh.getAbsolutePosition()
    );
  }
}


  private _updateForwardForce(): void {
    const { forwardForce } = poc1Config.movement;

    // 1. Extraer el forward real del cuerpo físico (antes del step de física)
    Vector3.TransformNormalToRef(this._forwardReference, this.boardMesh.getWorldMatrix(), this._forwardTemp);

    if (this.input.current.forward) {
      // COMPORTAMIENTO A: Acelerando (Igual que antes)
      this.boardAggregate.body.applyForce(
        this._forwardTemp.scaleInPlace(forwardForce),
        this.boardMesh.getAbsolutePosition()
      );
    } else {
      // COMPORTAMIENTO B: Desacelerando (El jugador soltó el botón)

      // Obtener la velocidad lineal total actual
      this.boardAggregate.body.getLinearVelocityToRef(this._velocityTemp);

      // Calcular cuánta velocidad lleva exclusivamente hacia adelante (Dot Product)
      const forwardSpeed = Vector3.Dot(this._velocityTemp, this._forwardTemp);

      // Solo frenamos si el vehículo se está moviendo efectivamente hacia adelante
      if (forwardSpeed > 0.05) {
        // Coeficiente de frenado: a mayor valor, más rápido se detiene al soltar el botón.
        // Podés mover este valor a tu 'poc1Config.movement.brakingDrag' más adelante.
        const brakingDragFactor = 0.5;
        const mass = poc1Config.board.mass;

        // Fuerza de frenado: -DirecciónForward * VelocidadForward * Masa * Factor
        // Usamos _forwardVelocityTemp para no contaminar _forwardTemp si lo necesitás después
        this._forwardTemp.scaleToRef(-forwardSpeed * mass * brakingDragFactor, this._forwardVelocityTemp);

        this.boardAggregate.body.applyForce(
          this._forwardVelocityTemp,
          this.boardMesh.getAbsolutePosition()
        );
      }
    }
  }

  private _applyLateralFriction(): void {

    // 1. Obtener la velocidad lineal actual del cuerpo físico
    this.boardAggregate.body.getLinearVelocityToRef(this._velocityTemp);

    // 2. Obtener el vector "Right" (derecha) real en el espacio del mundo
    Vector3.TransformNormalToRef(this._rightReference, this.boardMesh.getWorldMatrix(), this._rightTemp);

    // 3. Calcular cuánta velocidad lleva el vehículo de costado (Producto Punto / Dot Product)
    const lateralSpeed = Vector3.Dot(this._velocityTemp, this._rightTemp);

    // 4. Si hay deslizamiento lateral, aplicamos una fuerza opuesta para neutralizarlo
    if (Math.abs(lateralSpeed) > 0.01) {
      // Factor de agarre: 0.0 = hielo absoluto / 1.0 = agarre total inmediato (tren sobre rieles)
      // Sugiero empezar con un valor entre 0.1 y 0.5 para que mantenga un derrape controlado y divertido
      const driftGripFactor = 1;
      const mass = poc1Config.board.mass;

      // Fuerza necesaria: -DirecciónLateral * VelocidadLateral * Masa * Grip
      const counterForce = this._rightTemp.scaleInPlace(-lateralSpeed * mass * driftGripFactor);

      this.boardAggregate.body.applyForce(counterForce, this.boardMesh.getAbsolutePosition());
    }
  }

  private _updateJump(): void {
    if (!this.input.consumeJumpRequest()) return;

    const mass = poc1Config.board.mass;
    const impulse = mass * poc1Config.boost.impulse;

    this.boardAggregate.body.applyImpulse(new Vector3(0, impulse, 0), this.boardMesh.getAbsolutePosition());
  }

  private _updateTestImpulse(): void {
    if (!this.input.consumeTestImpulseRequest()) return;

    const mass = poc1Config.board.mass;
    const impulse = -mass * poc1Config.testImpulse.downwardVelocityKick;

    this.boardAggregate.body.applyImpulse(new Vector3(0, impulse, 0), this.boardMesh.getAbsolutePosition());
  }

  dispose(): void {
    // Limpieza si es necesario
  }
}
