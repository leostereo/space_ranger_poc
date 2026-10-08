import { LevelStrategy, type LevelStrategyDeps } from "../level-strategy";

/**
 * Nivel 1. PLACEHOLDER: todavía no hay Character, enemigos ni HUD (migraciones siguientes),
 * así que no tiene reglas propias: el resultado se fuerza con las teclas de depuración (solo DEV).
 * El visor es la cámara placeholder; se reemplaza por la del personaje.
 */
export class Level01Strategy extends LevelStrategy {
  // constructor(deps: LevelStrategyDeps) {
  //   super(deps);
  //   createLevelViewer(deps.context.scene, deps.context.canvas, deps.scope);
  // }

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
