import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { LevelStrategy } from "../level-strategy";

const END_REACHED_RADIUS = 3; // distancia a la meta para darla por alcanzada
const DEATH_TO_GAME_OVER_DELAY_SECONDS = 2.5; // deja ver la animación de muerte antes de la pantalla de derrota

/** Se gana llegando al final del camino; se pierde al caer del camino o unos segundos después de morir. */
export class Level06Strategy extends LevelStrategy {
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
        return this.secondsDead >= this.DEATH_TO_GAME_OVER_DELAY_SECONDS;
  }
}