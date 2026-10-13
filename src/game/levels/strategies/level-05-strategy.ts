import { LevelStrategy } from "../level-strategy";

export class Level05Strategy extends LevelStrategy {
    private secondsDead = 0;
    
    protected onTick(_deltaTime: number): void { }

    protected checkWin(): boolean {
        return this.enemies.aliveCount === 0;
    }

    protected checkLose(): boolean {
        return this.secondsDead >= this.DEATH_TO_GAME_OVER_DELAY_SECONDS;
    }
}