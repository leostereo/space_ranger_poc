import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

/**
 * Controller encargado exclusivamente de la traslación y rotación del Drone.
 * No toma decisiones lógicas, solo obedece órdenes de la FSM.
 */
export class DummyKamikazeMovementController {
  private readonly targetPosition = new Vector3();
  private isMoving = false;
  private speedMultiplier = 1.0;

  // Parámetros mecánicos suaves (Ajustables)
  private readonly baseSpeed = 4.0;

  constructor(
    private readonly root: TransformNode,
    private readonly visual: TransformNode
  ) {
    this.targetPosition.copyFrom(this.root.position);
  }

  /** Retorna true si el drone completó su trayectoria actual o se encuentra detenido. */
  public get isIdle(): boolean {
    return !this.isMoving;
  }

  /** Modifica la velocidad del drone (útil para acelerar dramáticamente en Chasing). */
  public setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = multiplier;
  }

  /** Ordena al drone viajar hacia una coordenada 3D específica. */
  public moveTo(destination: Vector3): void {
    this.targetPosition.copyFrom(destination);
    this.isMoving = true;
  }

  /** Cancela inmediatamente el movimiento actual congelando al drone en su posición. */
  public stop(): void {
    this.targetPosition.copyFrom(this.root.position);
    this.isMoving = false;
  }

  /** Hace que el drone se quede flotando a la espera durante un tiempo determinado. */
  public wait(_seconds: number): void {
    this.stop();
  }

  /** Fuerza al drone a rotar de manera fluida mirando directamente hacia un objetivo. */
  public lookAt(targetPosition: Vector3, freezePitch = true): void {
    const direction = targetPosition.subtract(this.root.position);
    
    if (freezePitch) {
      direction.y = 0; // Bloquear inclinación en Patrol/Spotting para mantener estabilidad
    }

    if (direction.lengthSquared() > 0.001) {
      direction.normalize();

      // Construye la rotación mirando a la dirección (Inversión coordinada para mano izquierda)
      const targetRotation = Quaternion.FromLookDirectionLH(direction, Vector3.UpReadOnly);

      if (!this.root.rotationQuaternion) {
        this.root.rotationQuaternion = Quaternion.Identity();
      }

      // Interpolar la rotación actual del root hacia el objetivo (Slerp) de forma fluida
      Quaternion.SlerpToRef(
        this.root.rotationQuaternion,
        targetRotation,
        0.1, // Factor de suavizado de giro
        this.root.rotationQuaternion
      );
    }
  }

  /** Aplica el desplazamiento físico frame a frame. */
  public update(deltaTime: number): void {
    if (!this.isMoving) return;

    const currentPos = this.root.position;
    const distanceToTarget = Vector3.Distance(currentPos, this.targetPosition);
    const arrivalThreshold = 0.2;

    if (distanceToTarget <= arrivalThreshold) {
      this.isMoving = false;
      return;
    }

    // El dron apunta hacia donde se está trasladando físicamente en este frame
    // Si viaja en persecución libre 3D, desactivamos el bloqueo Y para que incline la nariz
    const isChasingTarget = this.speedMultiplier > 1.5;
    this.lookAt(this.targetPosition, !isChasingTarget);

    const moveDir = this.targetPosition.subtract(currentPos).normalize();
    const currentFrameSpeed = this.baseSpeed * this.speedMultiplier * deltaTime;

    const distanceToStep = Math.min(currentFrameSpeed, distanceToTarget);
    this.root.position.addInPlace(moveDir.scale(distanceToStep));

    if (this.visual) {
      this.visual.rotation.z = Math.sin(currentPos.x * 2) * 0.05; // Cabeceo orgánico cosmético
    }
  }
}
