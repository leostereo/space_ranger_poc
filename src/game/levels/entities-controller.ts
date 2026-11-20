// src/game/controllers/entities-controller.ts
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type CharacterBase from "../entities/character/character.base";
import type { EnemiesManager } from "../entities/enemies/enemies-manager";
import { ManagedUnitInstance } from "./unit-builder.types";
import { Mesh, PhysicsAggregate } from "@babylonjs/core";
import { EventManager, GameEvents, ProjectileHitPayload } from "../services/event-manager";
import { BreakableMetadata } from "./procedural/obstacle-builder";

export class EntitiesController {
  private checkTimer = 0;
  private readonly CHECK_INTERVAL = 0.2; // 5 veces por segundo (200ms)
  private readonly managedUnits: ManagedUnitInstance[];
  private _isFirstFrame = true;
  private readonly unsubscribeHit: () => void;

  constructor(
    managedUnits: ManagedUnitInstance[],
    private readonly character: CharacterBase,
    private readonly enemiesManager: EnemiesManager,
    private readonly physicsBodies?: ReadonlyMap<Mesh, PhysicsAggregate> 
  ) {
    this.managedUnits = managedUnits ?? [];
    this.unsubscribeHit = EventManager.on(GameEvents.ProjectileHit, (hit) => this._onProjectileHit(hit));
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
      // Solo protegemos la plataforma de inicio para nunca apagar el piso donde nace el jugador
      if (!unit || unit.id === "start_zone") return;

      const distanceToCenter = Vector3.Distance(unit.centerPosition, playerPos);
      const shouldBeActive = distanceToCenter <= unit.distanceToEnable;

      if (forceSync || shouldBeActive !== unit.isCurrentlyActive) {
        this._applyUnitState(unit, shouldBeActive);
        unit.isCurrentlyActive = shouldBeActive;

        // 🟢 Siempre notificamos al EnemiesManager por unit.id (los spawns vienen pre-calculados)
        this.enemiesManager.setGroupStatus(unit.id, shouldBeActive);
      }
    });
  }

  private _applyUnitState(unit: ManagedUnitInstance, isActive: boolean): void {
    unit.meshes?.forEach((mesh) => {
      // 🟢 Guarda crítica: ignorar mallas destruidas (ej. bloques breakable) cuyo aggregate ya hizo dispose()
      if (!mesh || mesh.isDisposed()) return;

      mesh.setEnabled(isActive);
      mesh.isPickable = isActive;
      mesh.checkCollisions = mesh.name.includes("-tube") ? false : isActive;

      const aggregate = this.physicsBodies?.get(mesh);
      if (aggregate) {
        // Verificamos que el shape de Havok siga vivo en memoria WASM
        if (aggregate.shape && (aggregate.shape as any)._pluginData) {
          aggregate.shape.filterCollideMask = isActive ? 0xFFFFFFFF : 0;
          aggregate.shape.filterMembershipMask = isActive ? 0xFFFFFFFF : 0;
        }
        if (aggregate.body && (aggregate.body as any)._pluginData) {
          aggregate.body.disablePreStep = false;
          aggregate.body.setCollisionCallbackEnabled(isActive);
        }
      }
    });
  }

  private _onProjectileHit(hit: ProjectileHitPayload): void {
   // if (hit.sourceId !== undefined) return;

    const meta = hit.mesh.metadata as BreakableMetadata | undefined;
    if (!meta || meta.kind !== "breakable" || meta.isDestroyed) return;

    const ownerUnit = this.managedUnits.find((unit) => unit.meshes?.includes(hit.mesh as Mesh));
    if (!ownerUnit) return;

    // 🟢 Descontamos 1 disparo por cada impacto recibido
    meta.hitsRemaining -= 1;

    if (meta.hitsRemaining <= 0) {
      meta.isDestroyed = true;
      const aggregate = this.physicsBodies?.get(hit.mesh as Mesh);
      meta.destroy(aggregate);
    }
  }

  public dispose(): void {
    this.unsubscribeHit();
  }

}
