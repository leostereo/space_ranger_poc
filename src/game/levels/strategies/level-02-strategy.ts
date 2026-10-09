import { LevelStrategy, LevelStrategyDeps } from "../level-strategy";

export class Level02Strategy extends LevelStrategy {
  constructor(deps: LevelStrategyDeps) {
    super(deps);
    // createLevelViewer(deps.context.scene, deps.context.canvas, deps.scope);
  }

  protected override onPlay(): void {
    console.log(`[Level02Strategy] play: ${this.definition.id}, spawn: ${this.characterSpawn.toString()}`);
  }

  protected onTick(): void {
    // TODO: Character.update, EnemiesManager.update, HUD.update
  }

  protected checkWin(): boolean {
    return false; // TODO: todas las oleadas eliminadas
  }

  protected checkLose(): boolean {
    return false; // TODO: el personaje murió
  }
}