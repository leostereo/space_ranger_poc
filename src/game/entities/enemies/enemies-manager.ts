import { EventSubscriber } from "@/game/services/event-subscriber";
import { GameEvents, type ProjectileHitPayload } from "@/game/services/event-manager";
import type { Enemy } from "./enemy";

/**
 * Dueño de todos los enemigos del nivel: los actualiza, los pausa y los libera juntos.
 * También escucha los impactos de proyectiles y se los entrega al enemigo alcanzado.
 */
export class EnemiesManager extends EventSubscriber {
  private readonly enemies: Enemy[] = [];
  private paused = false;
  private disposed = false;

  constructor() {
    super();
    this.subscribeEvents();
  }

  get count(): number {
    return this.enemies.length;
  }

  /** Registra un enemigo. Si el manager ya fue liberado, lo libera de inmediato. */
  add<T extends Enemy>(enemy: T): T {
    if (this.disposed) {
      enemy.dispose();
    } else {
      this.enemies.push(enemy);
    }
    return enemy;
  }

  update(deltaTime: number): void {
    if (this.paused || this.disposed) {
      return;
    }
    for (const enemy of this.enemies) {
      enemy.update(deltaTime);
    }
  }

  pause(): void {
    if (this.paused || this.disposed) {
      return;
    }
    this.paused = true;
    this.enemies.forEach((enemy) => enemy.pause());
  }

  resume(): void {
    if (!this.paused || this.disposed) {
      return;
    }
    this.paused = false;
    this.enemies.forEach((enemy) => enemy.resume());
  }

  /** La partida terminó en derrota: los enemigos dejan de actuar. */
  gameOver(): void {
    if (this.disposed) {
      return;
    }
    this.enemies.forEach((enemy) => enemy.gameOver());
  }

  /** Idempotente. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.unsubscribeEvents();
    for (const enemy of this.enemies) {
      try {
        enemy.dispose();
      } catch (error) {
        console.error(`[EnemiesManager] failed to dispose the enemy "${enemy.id}"`, error);
      }
    }
    this.enemies.length = 0;
  }

  protected registerEvents(): void {
    this.listen(GameEvents.ProjectileHit, (hit) => this.onProjectileHit(hit));
  }

  private onProjectileHit(hit: ProjectileHitPayload): void {
    if (this.paused || this.disposed) {
      return;
    }
    this.enemies.find((enemy) => enemy.ownsMesh(hit.mesh))?.takeHit(hit);
  }
}