import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Axis } from "@babylonjs/core/Maths/math.axis";

import { poc1Config } from "./config";
import type { BoardInput } from "./board-input";

/**
 * Controller de física del board flotante adaptado.
 */
export class FloatingBoardController {
  private elapsedTime = 0;
  private isHovering = false;
  private rollAngle = 0; // radianes, ángulo de banco visual actual

  // Reutilización de vectores en memoria para evitar Garbage Collection en cada frame
  private _bodyRotationTemp = new Quaternion();
  private _forwardReference = Vector3.Forward(); // Vector estático de referencia (0,0,1)
  private _forwardTemp = new Vector3();
  private _rightReference = Vector3.Right(); // Vector estático (1,0,0)
  private _rightTemp = new Vector3();        // Contenedor para el eje lateral del mundo
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
  }

  /** Se llama en `scene.onBeforePhysicsObservable` */
  update(): void {
    const dt = this.scene.getEngine().getDeltaTime() / 1000;
    this.elapsedTime += dt;

    this._updateHover();
    this._updateRollAndYaw(dt);
    this._updateForwardForce();
    this._applyLateralFriction();
    this._updateJump();
    this._updateTestImpulse();
  }

  /** Se llama en `scene.onAfterPhysicsObservable` */
  applyVisualRoll(): void {
    // El mesh ya fue sincronizado por Havok (solo hereda la rotación Yaw del body).
    // Multiplicamos el banco visual sobre el eje Z local del mesh.
    const rollQuat = Quaternion.RotationAxis(Axis.Z, -this.rollAngle);
    this.boardMesh.rotationQuaternion = this.boardMesh.rotationQuaternion!.multiply(rollQuat);
  }

  private _updateHover(): void {
    const { height, springStrength, damping, bobAmplitude, bobFrequency } = poc1Config.hover;
    const mass = poc1Config.board.mass;

    const angularFrequency = bobFrequency * 2 * Math.PI;
    const targetHeight = height + bobAmplitude * Math.sin(this.elapsedTime * angularFrequency);
    const currentHeight = this.boardMesh.position.y;

    const shouldHover = currentHeight <= targetHeight;

    if (shouldHover !== this.isHovering) {
      this.isHovering = shouldHover;
      this.boardAggregate.body.setGravityFactor(shouldHover ? 0 : 1);
    }

    if (!this.isHovering) return;

    const verticalVelocity = this.boardAggregate.body.getLinearVelocity().y;
    const error = targetHeight - currentHeight;
    const springForce = mass * (error * springStrength - verticalVelocity * damping);

    this.boardAggregate.body.applyForce(new Vector3(0, springForce, 0), this.boardMesh.getAbsolutePosition());
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
    console.log('la')
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
