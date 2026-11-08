// src/game/controllers/entities-controller.ts
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type CharacterBase from "../entities/character/character.base";
import { ManagedUnitInstance } from "./unit-builder.types";

export class EntitiesController {
  private checkTimer = 0;
  private readonly CHECK_INTERVAL = 0.2; // Throttling: 5 veces por segundo (200ms)
  private readonly managedUnits: ManagedUnitInstance[];

  constructor(
    managedUnits: ManagedUnitInstance[],
    private readonly character: CharacterBase
  ) {
    // Si llega undefined o null, se inicializa como array vacío de forma segura
    this.managedUnits = managedUnits ?? [];
  }

  /**
   * Ejecuta el ciclo de optimización de mallas por proximidad euclídea al centro 3D.
   */
  public update(deltaTime: number): void {
    if (this.managedUnits.length === 0) return;

    this.checkTimer += deltaTime;

    if (this.checkTimer >= this.CHECK_INTERVAL) {
      const playerPos = this.character.position;

      this.managedUnits.forEach((unit) => {
        if (!unit || unit.enabledDefault) return;

        // Cálculo directo de distancia al centro geométrico 3D
        const distanceToCenter = Vector3.Distance(unit.centerPosition, playerPos);
        const shouldBeActive = distanceToCenter <= unit.distanceToEnable;

        if (shouldBeActive && !unit.isCurrentlyActive) {
          // 🔓 ACTIVAR SECTOR EN BABYLON
          unit.meshes?.forEach(mesh => mesh.setEnabled(true));
          unit.isCurrentlyActive = true;

          if (import.meta.env.DEV) {
            console.log(`[EntitiesController] 🔓 Sector "${unit.id}" activado. Distancia: ${distanceToCenter.toFixed(1)}m`);
          }
        } 
        else if (!shouldBeActive && unit.isCurrentlyActive) {
          // 🔒 DESACTIVAR SECTOR EN BABYLON
          unit.meshes?.forEach(mesh => mesh.setEnabled(false));
          unit.isCurrentlyActive = false;

          if (import.meta.env.DEV) {
            console.log(`[EntitiesController] 🔒 Sector "${unit.id}" suspendido. Distancia: ${distanceToCenter.toFixed(1)}m`);
          }
        }
      });

      this.checkTimer = 0;
    }
  }
}
