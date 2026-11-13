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

      const aggregate = this.physicsBodies?.get(mesh);
      if (aggregate) {
        if (aggregate.shape) {
        aggregate.shape.filterCollideMask = isActive ? 0xFFFFFFFF : 0;
          aggregate.shape.filterMembershipMask = isActive ? 0xFFFFFFFF : 0;
        }
        if (aggregate.body) {
          // 🟢 Forzamos a Havok a sincronizar la posición y habilitar la física al encender
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

  private _destroyBreakableMesh(mesh: Mesh): void {
    // 1. Liberamos el agregado físico en Havok
    const aggregate = this.physicsBodies?.get(mesh);
    if (aggregate) {
      aggregate.dispose();
    }

    // 2. Apagamos y liberamos la malla visual
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    mesh.setEnabled(false);
    mesh.dispose();
  }


  public dispose(): void {
    this.unsubscribeHit();
  }

}
