import { LevelStrategy } from "../level-strategy";

const DEATH_TO_GAME_OVER_DELAY_SECONDS = 2.5; // deja ver la animación de muerte antes de la pantalla de derrota

/** Nivel de prueba de la muerte: no se gana, solo se puede perder (los drones te tienen que matar). */
export class Level03Strategy extends LevelStrategy {
  private secondsDead = 0;

  protected onTick(deltaTime: number): void {
    if (this.character.isDead) {
      this.secondsDead += deltaTime;
    }
  }

  protected checkWin(): boolean {
    return false;
  }

  protected checkLose(): boolean {
    return this.secondsDead >= DEATH_TO_GAME_OVER_DELAY_SECONDS;
  }
}