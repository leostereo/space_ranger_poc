import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import type { EnemyType } from "../../levels/level-definition";
import type { ProjectileHitPayload } from "@/game/services/event-manager";

/** Contrato de todo enemigo: lo único que el EnemiesManager sabe de ellos. */
export interface Enemy {
  readonly id: string;
  readonly type: EnemyType;
  /** ¿Esta malla pertenece a este enemigo? Sirve para resolver a quién alcanzó un proyectil. */
  ownsMesh(mesh: AbstractMesh): boolean;
  update(deltaTime: number): void;
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
  private disposed = false;

  constructor(
    readonly id: string,
    readonly type: EnemyType,
  ) {}

  abstract ownsMesh(mesh: AbstractMesh): boolean;

  update(deltaTime: number): void {
    if (this.paused || this.isGameOver || this.disposed) {
      return;
    }
    this.onUpdate(deltaTime);
  }

  takeHit(hit: ProjectileHitPayload): void {
    if (this.isGameOver || this.disposed) {
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

  protected abstract onUpdate(deltaTime: number): void;
  protected onHit(_hit: ProjectileHitPayload): void {}
  protected onPause(): void {}
  protected onResume(): void {}
  protected onGameOver(): void {}
  protected abstract onDispose(): void;
}