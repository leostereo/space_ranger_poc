import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

const TURN_SPEED_RADIANS = Math.PI; // 180°/s
const ALIGN_TOLERANCE_RADIANS = (3 * Math.PI) / 180; // alineado: empieza a trasladarse
const MOVE_SPEED = 2.5; // m/s (promedio: con suavizado arranca y frena despacio)
const EASE_MOVEMENT = true; // smoothstep sobre el lerp
const DWELL_SECONDS = 0.5; // pausa al llegar
const MIN_TRAVEL_DISTANCE = 0.5; // destinos más cercanos no valen un viaje

type MovementPhase = "idle" | "turning" | "moving" | "waiting";

const TWO_PI = Math.PI * 2;

/** Diferencia angular más corta de `from` a `to`, entre −π y π. */
const shortestAngleDiff = (from: number, to: number): number => {
  let diff = (to - from) % TWO_PI;
  if (diff > Math.PI) {
    diff -= TWO_PI;
  } else if (diff < -Math.PI) {
    diff += TWO_PI;
  }
  return diff;
};

/**
 * Mueve un nodo hacia un destino: primero gira (yaw) hasta mirarlo y después se traslada con lerp.
 * Al llegar espera un instante y queda libre (idle). El cañón sale siempre hacia adelante del nodo.
 */
export class SentinelMovementController {
  private phase: MovementPhase = "idle";
  private yaw: number;
  private readonly start = new Vector3();
  private readonly target = new Vector3();
  private moveElapsed = 0;
  private moveDuration = 0;
  private waitRemaining = 0;

  constructor(private readonly root: TransformNode) {
    this.yaw = root.rotation.y;
  }

  /** Libre: terminó el viaje (o no tiene ninguno). */
  get isIdle(): boolean {
    return this.phase === "idle";
  }

  /** Empieza un viaje: gira hacia el destino y se traslada hasta él. */
  moveTo(destination: Vector3): void {
    this.target.copyFrom(destination);
    if (Vector3.DistanceSquared(this.root.position, this.target) < MIN_TRAVEL_DISTANCE * MIN_TRAVEL_DISTANCE) {
      this.wait(DWELL_SECONDS);
      return;
    }
    this.phase = "turning";
  }

  /** Se queda quieto `seconds` y después queda libre (también sirve para reintentar más tarde). */
  wait(seconds: number): void {
    this.phase = "waiting";
    this.waitRemaining = seconds;
  }

  update(deltaTime: number): void {
    switch (this.phase) {
      case "turning":
        this.updateTurning(deltaTime);
        break;
      case "moving":
        this.updateMoving(deltaTime);
        break;
      case "waiting":
        this.waitRemaining -= deltaTime;
        if (this.waitRemaining <= 0) {
          this.phase = "idle";
        }
        break;
      case "idle":
        break;
    }
  }

  private updateTurning(deltaTime: number): void {
    const desiredYaw = Math.atan2(this.target.x - this.root.position.x, this.target.z - this.root.position.z);
    const diff = shortestAngleDiff(this.yaw, desiredYaw);

    if (Math.abs(diff) <= ALIGN_TOLERANCE_RADIANS) {
      this.yaw = desiredYaw;
      this.root.rotation.y = this.yaw;
      this.startMoving();
      return;
    }

    const step = Math.min(Math.abs(diff), TURN_SPEED_RADIANS * deltaTime);
    this.yaw += Math.sign(diff) * step;
    this.root.rotation.y = this.yaw;
  }

  private startMoving(): void {
    this.start.copyFrom(this.root.position);
    this.moveDuration = Vector3.Distance(this.start, this.target) / MOVE_SPEED;
    this.moveElapsed = 0;
    this.phase = "moving";
  }

  private updateMoving(deltaTime: number): void {
    this.moveElapsed += deltaTime;
    const t = Math.min(this.moveElapsed / this.moveDuration, 1);
    const eased = EASE_MOVEMENT ? t * t * (3 - 2 * t) : t;
    Vector3.LerpToRef(this.start, this.target, eased, this.root.position);

    if (t >= 1) {
      this.wait(DWELL_SECONDS);
    }
  }
}