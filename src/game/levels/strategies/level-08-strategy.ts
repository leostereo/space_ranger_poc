// src/game/strategies/level-08-strategy.ts
import { level08ManagedUnits } from "../definitions/level-08-definition";
import { LevelStrategy } from "../level-strategy"; // Tu import base

export class Level08Strategy extends LevelStrategy {
  
  protected override onPlay(): void {
    super.onPlay();

    // 🟢 AQUÍ TENÉS TODA LA INFO DISPONIBLE DESDE EL PRIMER FRAME:
    console.log("--- Datos Disponibles para diseñar tu optimización ---");
    
    level08ManagedUnits.forEach((unit) => {
      console.log(`Unidad ID: ${unit.id} (${unit.kind})`);
      console.log(`-> Centro Geométrico en 3D:`, unit.centerPosition);
      console.log(`-> Distancia de activación configurada: ${unit.distanceToEnable} metros`);
      console.log(`-> Cantidad de mallas físicas en Babylon: ${unit.meshes.length}`);
      console.log(`-> Cantidad de enemigos pre-calculados: ${unit.enemySpawns.length}`);
      console.log(`-> ¿Está activa ahora mismo en escena?: ${unit.isCurrentlyActive}`);
    });
  }

  protected onTick(deltaTime: number): void {
    // Tu lógica de gameplay limpia.
    // Cuando quieras diseñar tu controlador, sólo leerás el array `level08ManagedUnits`.
  }

  protected checkWin(): boolean { return false; }
  protected checkLose(): boolean { return this.character.isDead; }
}
