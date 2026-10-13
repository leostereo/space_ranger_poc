import { LevelStrategy } from "../level-strategy";

/** Se gana destruyendo todos los sentinels; se pierde unos segundos después de que el personaje muere. */
export class Level04Strategy extends LevelStrategy {
  private secondsDead = 0;

  protected onTick(deltaTime: number): void {
    if (this.character.isDead) {
      this.secondsDead += deltaTime;
    }
  }

  protected checkWin(): boolean {
    return this.enemies.aliveCount === 0;
  }

  protected checkLose(): boolean {
    return this.secondsDead >= this.DEATH_TO_GAME_OVER_DELAY_SECONDS;
  }
}