// src/game/strategies/level-08-strategy.ts
import { EntitiesController } from "../entities-controller";
import { LevelStrategy, type LevelStrategyDeps } from "../level-strategy";

export class Level08Strategy extends LevelStrategy {
  private _entitiesController!: EntitiesController;

  constructor(deps: LevelStrategyDeps) {
    super(deps);
  }

  protected override onPlay(): void {
    super.onPlay();

    // 🟢 LOG DE VERIFICACIÓN (Imprime las mallas inyectadas desde el Setup)
    console.log("=== [Level08Strategy] Verificando Managed Units Inyectadas ===");
    console.log(`Total de unidades gestionadas recibidas: ${this._managedUnits.length}`);
    
    this._managedUnits.forEach((unit) => {
      console.log(`- Unidad: [${unit.id}] de tipo (${unit.kind})`);
      console.log(`  Mallas físicas listas: ${unit.meshes?.length ?? 0}`);
      console.log(`  Enemigos precalculados: ${unit.enemySpawns?.length ?? 0}`);
    });
    console.log("=============================================================");

    // Inicialización del controlador
    this._entitiesController = new EntitiesController(this._managedUnits, this.character);
  }

  protected onTick(deltaTime: number): void {
    if (this._entitiesController) {
      this._entitiesController.update(deltaTime);
    }
  }

  protected checkWin(): boolean { return false; }
  protected checkLose(): boolean { return this.character.isDead; }
}
