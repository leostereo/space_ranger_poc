// src/game/controllers/entities-controller.ts
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type CharacterBase from "../entities/character/character.base";
import type { EnemiesManager } from "../entities/enemies/enemies-manager";
import { ManagedUnitInstance } from "./unit-builder.types";
import { Mesh, PhysicsAggregate } from "@babylonjs/core";

export class EntitiesController {
  private checkTimer = 0;
  private readonly CHECK_INTERVAL = 0.2; // 5 veces por segundo (200ms)
  private readonly managedUnits: ManagedUnitInstance[];
  private _isFirstFrame = true;

  constructor(
    managedUnits: ManagedUnitInstance[],
    private readonly character: CharacterBase,
    private readonly enemiesManager: EnemiesManager,
    private readonly physicsBodies?: ReadonlyMap<Mesh, PhysicsAggregate> 
  ) {
    this.managedUnits = managedUnits ?? [];
  }

  public update(deltaTime: number): void {
    if (this.managedUnits.length === 0) return;

    if (this._isFirstFrame) {
      this._evaluateSectors(true); // 🟢 Pasamos flag de inicialización
      this._isFirstFrame = false;
      return;
    }

    this.checkTimer += deltaTime;
    if (this.checkTimer >= this.CHECK_INTERVAL) {
      this._evaluateSectors(false);
      this.checkTimer = 0;
    }
  }

  private _evaluateSectors(forceSync = false): void {
    const playerPos = this.character.position;

    this.managedUnits.forEach((unit) => {
      // 🟢 Quitamos `|| unit.enabledDefault` si querés que el PP también se apague al alejarte
      if (!unit || unit.id === "start_zone") return;

      const distanceToCenter = Vector3.Distance(unit.centerPosition, playerPos);
      const shouldBeActive = distanceToCenter <= unit.distanceToEnable;

      if (forceSync || shouldBeActive !== unit.isCurrentlyActive) {
        this._applyUnitState(unit, shouldBeActive);
        unit.isCurrentlyActive = shouldBeActive;

        if (unit.enemySpawns && unit.enemySpawns.length > 0) {
          this.enemiesManager.setGroupStatus(unit.id, shouldBeActive);
        }
      }
    });
  }

  private _applyUnitState(unit: ManagedUnitInstance, isActive: boolean): void {
    unit.meshes?.forEach((mesh) => {
      mesh.setEnabled(isActive);
      mesh.isPickable = isActive;
      mesh.checkCollisions = mesh.name.includes("-tube") ? false : isActive;

      // 🟢 Apagamos o prendemos la colisión en Havok
      const aggregate = this.physicsBodies?.get(mesh);
      if (aggregate && aggregate.shape) {
        // 0 = no colisiona con nada; 0xFFFFFFFF = colisiona con todo
        aggregate.shape.filterCollideMask = isActive ? 0xFFFFFFFF : 0;
      }
    });
  }
}
