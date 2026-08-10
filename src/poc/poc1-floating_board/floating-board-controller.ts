import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Axis } from "@babylonjs/core/Maths/math.axis";

import { poc1Config } from "./config";
import type { BoardInput } from "./board-input";
import { Ray } from "@babylonjs/core";

/**
 * Controller de física del board flotante adaptado.
 */
export class FloatingBoardController {
  private elapsedTime = 0;
  private isHovering = false;
  private rollAngle = 0; // radianes, ángulo de banco visual actual

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
  this._updateJump();
  this._updateTestImpulse();
}

  applyVisualRoll(): void {
  // 1. Extraemos la rotación física real y limpia que Havok le acaba de otorgar al Body
  // Para Physics V2, la forma más segura si el body ya sincronizó al mesh es usar el quaternion actual del mesh como base limpia

  // 2. Calculamos el quat del Roll visual
  const rollQuat = Quaternion.RotationAxis(Axis.Z, -this.rollAngle);

  // 3. Aplicamos el Roll multiplicando de forma que NO se acumule frame a frame,
  // sino que actúe como un offset local temporal para este renderizado.
  this.boardMesh.rotationQuaternion = this.boardMesh.rotationQuaternion!.multiply(rollQuat);
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

    // 2. LANZAR RAYO FILTRANDO LA PATINETA
    const hit = this.scene.pickWithRay(this._ray, (mesh) => {
      return mesh.isPickable && mesh !== this.boardMesh && mesh.parent !== this.boardMesh;
    });

    const actualDistanceToGround = (hit && hit.hit) ? (hit.distance + thicknessOffset) : 999;

    // Evaluamos el Hover estrictamente basándonos en la distancia de amortiguación real
    const shouldHover = hit !== null && hit.hit && actualDistanceToGround <= height;
    this.isHovering = shouldHover;

    this.boardAggregate.body.setGravityFactor(1);

    // Variables para el log de debug
    let calculatedForceY = 0;
    let debugMode = "AIRE";

    // =========================================================================
    // CASO A: LA PATINETA ESTÁ EN EL AIRE (Caída o Planeo)
    // =========================================================================
    if (!this.isHovering) {
      this.boardAggregate.body.getLinearVelocityToRef(this._velocityTemp);

      const horizontalVelocity = new Vector3(this._velocityTemp.x, 0, this._velocityTemp.z);
      const forwardSpeed = horizontalVelocity.length();
      const fallSpeed = this._velocityTemp.y;

      if (fallSpeed < 0 && forwardSpeed > 1) {
        debugMode = "AIRE_PLANEO";
        const glideFactor = 0.08;
        let liftAmount = mass * forwardSpeed * Math.abs(fallSpeed) * glideFactor;

        const maxLiftLimit = mass * 9.81 * 0.95;
        if (liftAmount > maxLiftLimit) {
          liftAmount = maxLiftLimit;
        }

        calculatedForceY = liftAmount;

        this.boardAggregate.body.applyForce(
          new Vector3(0, liftAmount, 0),
          this._raycastPositionTemp
        );
      } else {
        debugMode = "AIRE_CAIDA_LIBRE";
      }

      // ---- LOG DE DEBUG CONTROLADO (1 VEZ POR SEGUNDO) ----
      this._debugTimer += this.scene.getEngine().getDeltaTime() / 1000;
      if (this._debugTimer >= 1.0) {
        console.log(`[BOARD DEBUG - AIRE] 
        Altura Y Actual: ${this.boardMesh.position.y.toFixed(2)}
        Distancia Suelo: ${actualDistanceToGround.toFixed(2)}
        Velocidad Vertical: ${this.boardAggregate.body.getLinearVelocity().y.toFixed(2)}
        Fuerza Aplicada Y: ${calculatedForceY.toFixed(2)}
        Modo: ${debugMode}
      `);
        this._debugTimer = 0;
      }

      return;
    }

    // =========================================================================
    // CASO B: LA PATINETA ESTÁ EN TIERRA (Resorte Magnético de Hover)
    // =========================================================================
    debugMode = "TIERRA_HOVER";
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

    calculatedForceY = finalForceY;

    this.boardAggregate.body.applyForce(
      new Vector3(0, finalForceY, 0),
      this._raycastPositionTemp
    );

    // ---- LOG DE DEBUG CONTROLADO (1 VEZ POR SEGUNDO) ----
    this._debugTimer += this.scene.getEngine().getDeltaTime() / 1000;
    if (this._debugTimer >= 1.0) {
      console.log(`[BOARD DEBUG - TIERRA] 
      Altura Y Actual: ${this.boardMesh.position.y.toFixed(2)}
      Distancia Suelo: ${actualDistanceToGround.toFixed(2)}
      Error Resorte: ${error.toFixed(2)}
      Velocidad Vertical: ${verticalVelocity.toFixed(2)}
      Fuerza Aplicada Y: ${calculatedForceY.toFixed(2)}
      Modo: ${debugMode}
    `);
      this._debugTimer = 0;
    }
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
