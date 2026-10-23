import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { ProjectileHitPayload } from "@/game/services/event-manager";
import type { EnemyType } from "../../levels/level-definition";


/** Contrato de todo enemigo: lo único que el EnemiesManager sabe de ellos. */
export interface Enemy {
  readonly id: string;
  readonly type: EnemyType;
  /** false cuando fue destruido o liberado. */
  readonly isAlive: boolean;
  /** ¿Esta malla pertenece a este enemigo? Sirve para resolver a quién alcanzó un proyectil. */
  ownsMesh(mesh: AbstractMesh): boolean;
  update(deltaTime: number, playerPosition: Vector3): void;
  takeHit(hit: ProjectileHitPayload): void;
  pause(): void;
  resume(): void;
  gameOver(): void;
  /** Idempotente. */
  dispose(): void;
}

/**
 * Base con el ciclo de vida común (template method): cada enemigo define su comportamiento
 * en onUpdate y, si lo necesita, en los demás hooks.
 */
export abstract class EnemyBase implements Enemy {
  protected paused = false;
  protected isGameOver = false;
  private destroyed = false;
  private disposed = false;

  constructor(
    readonly id: string,
    readonly type: EnemyType,
  ) {}

  get isAlive(): boolean {
    return !this.destroyed && !this.disposed;
  }

  abstract ownsMesh(mesh: AbstractMesh): boolean;

  update(deltaTime: number, playerPosition: Vector3): void {
    if (this.paused || this.isGameOver || !this.isAlive) {
      return;
    }
    this.onUpdate(deltaTime, playerPosition);
  }

  takeHit(hit: ProjectileHitPayload): void {
    if (this.isGameOver || !this.isAlive) {
      return;
    }
    this.onHit(hit);
  }

  pause(): void {
    if (this.paused) {
      return;
    }
    this.paused = true;
    this.onPause();
  }

  resume(): void {
    if (!this.paused) {
      return;
    }
    this.paused = false;
    this.onResume();
  }

  gameOver(): void {
    if (this.isGameOver) {
      return;
    }
    this.isGameOver = true;
    this.onGameOver();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.onDispose();
  }

  /** Lo llama el propio enemigo cuando muere: deja de contar como vivo y suelta sus recursos. */
  protected destroy(): void {
    if (!this.isAlive) {
      return;
    }
    this.destroyed = true;
    this.onDestroyed();
  }

  protected abstract onUpdate(deltaTime: number, playerPosition: Vector3): void;
  protected onHit(_hit: ProjectileHitPayload): void {}
  protected onPause(): void {}
  protected onResume(): void {}
  protected onGameOver(): void {}
  /** El enemigo murió: soltar mesh, cuerpo físico, etc. El manager lo libera igual al terminar el nivel. */
  protected onDestroyed(): void {}
  protected abstract onDispose(): void;
}