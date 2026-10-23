import { LevelStrategy } from "../level-strategy";

export class Level07Strategy extends LevelStrategy {
    protected onTick(_deltaTime: number): void {}

    protected checkWin(): boolean {
        return this.enemies.aliveCount === 0; // Se gana si el drone es destruido o estalla
    }

    protected checkLose(): boolean {
        return this.character.isDead; // Se pierde si el personaje muere
    }
}
