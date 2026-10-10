import { LevelStrategy } from "../level-strategy";

const DEATH_TO_GAME_OVER_DELAY_SECONDS = 2.5; // deja ver la animación de muerte antes de la pantalla de derrota

/** Se gana destruyendo todos los drones; se pierde unos segundos después de que el personaje muere. */export class Level03Strategy extends LevelStrategy {
  private secondsDead = 0;

  protected onTick(deltaTime: number): void {
    if (this.character.isDead) {
      this.secondsDead += deltaTime;
    }
  }

  protected checkWin(): boolean {
    return this.enemies.aliveCount === 0; // todos los drones destruidos
  }

  protected checkLose(): boolean {
    return this.secondsDead >= DEATH_TO_GAME_OVER_DELAY_SECONDS;
  }
}