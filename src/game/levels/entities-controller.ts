// src/game/controllers/entities-controller.ts
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type CharacterBase from "../entities/character/character.base";
import type { EnemiesManager } from "../entities/enemies/enemies-manager"; // 🟢 IMPORTANTE
import { ManagedUnitInstance } from "./unit-builder.types";

export class EntitiesController {
  private checkTimer = 0;
  private readonly CHECK_INTERVAL = 0.2; // 5 veces por segundo (200ms)
  private readonly managedUnits: ManagedUnitInstance[];
  private _isFirstFrame = true; // 🟢 Bandera para el Frame 0

  constructor(
    managedUnits: ManagedUnitInstance[],
    private readonly character: CharacterBase,
    private readonly enemiesManager: EnemiesManager // 🟢 INYECTADO: Para apagar/prender IAs
  ) {
    this.managedUnits = managedUnits ?? [];
  }

  public update(deltaTime: number): void {
    if (this.managedUnits.length === 0) return;

    // 🟢 Si es el primer frame, forzamos la evaluación omitiendo el Throttling de 200ms
    if (this._isFirstFrame) {
      this._evaluateSectors();
      this._isFirstFrame = false;
      return;
    }

    this.checkTimer += deltaTime;
    if (this.checkTimer >= this.CHECK_INTERVAL) {
      this._evaluateSectors();
      this.checkTimer = 0;
    }
  }
private _evaluateSectors(): void {
  const playerPos = this.character.position;

  this.managedUnits.forEach((unit) => {
    if (!unit || unit.enabledDefault) return;

    const distanceToCenter = Vector3.Distance(unit.centerPosition, playerPos);
    const shouldBeActive = distanceToCenter <= unit.distanceToEnable;

    if (shouldBeActive && !unit.isCurrentlyActive) {
      unit.meshes?.forEach(mesh => mesh.setEnabled(true));
      unit.isCurrentlyActive = true;

      if (unit.enemySpawns && unit.enemySpawns.length > 0) {
        this.enemiesManager.setGroupStatus(unit.id, true);
      }

      if (import.meta.env.DEV) {
        console.log(`[EntitiesController] 🔓 Sector "${unit.id}" (Meshes + Drones) Activado.`);
      }
    } 
    else if (!shouldBeActive && unit.isCurrentlyActive) {
      unit.meshes?.forEach(mesh => mesh.setEnabled(false));
      unit.isCurrentlyActive = false;

      if (unit.enemySpawns && unit.enemySpawns.length > 0) {
        this.enemiesManager.setGroupStatus(unit.id, false);
      }

      if (import.meta.env.DEV) {
        console.log(`[EntitiesController] 🔒 Sector "${unit.id}" (Meshes + Drones) Suspendido.`);
      }
    }
  });
}

}
