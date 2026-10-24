import { LevelStrategy } from "../level-strategy";

const WIN_TO_GAME_OVER_DELAY_SECONDS = 2.0; // 🟢 Margen de 2 segundos para ver el desenlace cosmético

export class Level07Strategy extends LevelStrategy {
    private secondsWon = 0;
    private secondsDead = 0;

    protected onTick(deltaTime: number): void {
        // Incrementa el cronómetro de victoria si ya no quedan drones activos en escena
        if (this.enemies.aliveCount === 0) {
            this.secondsWon += deltaTime;
        }
        
        if (this.character.isDead) {
            this.secondsDead += deltaTime;
        }
    }

    protected checkWin(): boolean {
        // 🟢 Sincroniza la victoria aplicando el retraso configurado
        return this.secondsWon >= WIN_TO_GAME_OVER_DELAY_SECONDS;
    }

    protected checkLose(): boolean {
        return this.secondsDead >= this.DEATH_TO_GAME_OVER_DELAY_SECONDS;
    }
}
