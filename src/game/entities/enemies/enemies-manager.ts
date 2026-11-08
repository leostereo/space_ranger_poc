// src/game/entities/enemies/enemies-manager.ts
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { EventSubscriber } from "@/game/services/event-subscriber"; // O tu path correcto de EventSubscriber
import { GameEvents, type ProjectileHitPayload } from "@/game/services/event-manager";
import { AssetRegistry } from "@/game/assets/asset-registry";
import { NavigationService } from "@/game/navigation/navigation-service";
import { EnemySpawn, EnemySpawns, EnemyType } from "@/game/levels/level-definition";
import { DummyTarget } from "./dummy-target";
import { StaticDrone } from "./static-drone";
import { SentinelDrone } from "./sentinel/sentinel-drone";
import { FlyingSentinelDrone } from "./flying-sentinel/flying-sentinel-drone";
import { RaycastDummy } from "./raycast-dummy";
import { DummyKamikazeDrone } from "./dummy-kamikaze-drone/dummy-kamikaze-drone";


// ==========================================
// 1. CONTRATOS E INTERFACES CORE
// ==========================================

export interface EnemyDeps {
  readonly scene: Scene;
  readonly registry: AssetRegistry;
  /** ¿Esta malla es del jugador (o de su board)? Los enemigos que disparan lo usan para saber si lo alcanzaron. */
  readonly isPlayerMesh: (mesh: AbstractMesh) => boolean;
  /** Puntos navegables para los enemigos que se mueven solos. */
  readonly navigation: NavigationService;
}

export interface Enemy {
  readonly id: string;
  readonly type: EnemyType;
  readonly isAlive: boolean;
  groupId?: string; // 🟢 Propiedad añadida para soporte de Culling por Sectores
  ownsMesh(mesh: AbstractMesh): boolean;
  update(deltaTime: number, playerPosition: Vector3): void;
  takeHit(hit: ProjectileHitPayload): void;
  pause(): void;
  resume(): void;
  gameOver(): void;
  dispose(): void;
}

type EnemyBuilder = (spawn: EnemySpawn, id: string, deps: EnemyDeps) => Enemy;

// Diccionario de builders (Asegúrate de importar tus clases concretas aquí)
const ENEMY_BUILDERS: Readonly<Partial<Record<EnemyType, EnemyBuilder>>> = {
  dummyTarget: (spawn, id, deps) => new DummyTarget(id, spawn.position, deps),
  staticDrone: (spawn, id, deps) => new StaticDrone(id, spawn, deps),
  sentinelDrone: (spawn, id, deps) => new SentinelDrone(id, spawn, deps),
  flyingSentinel: (spawn, id, deps) => new FlyingSentinelDrone(id, spawn, deps),
  raycastDummy: (spawn, id, deps) => new RaycastDummy(id, spawn, deps),
  dummyKamikazeDrone: (spawn, id, deps) => new DummyKamikazeDrone(id, spawn, deps),
};

// ==========================================
// 2. ORQUESTADOR FACTORY
// ==========================================

/** Crea todos los enemigos que pide el nivel y los deja registrados en un EnemiesManager. */
export function createEnemiesManager(spawns: EnemySpawns, deps: EnemyDeps): EnemiesManager {
  const manager = new EnemiesManager();
  try {
    for (const [type, entries] of Object.entries(spawns) as [EnemyType, readonly EnemySpawn[] | undefined][]) {
      if (!entries || entries.length === 0) {
        continue;
      }
      const build = ENEMY_BUILDERS[type];
      if (!build) {
        throw new Error(`[createEnemiesManager] there is no builder registered for the enemy "${type}"`);
      }
      
      entries.forEach((spawn, index) => {
        const enemy = build(spawn, `${type}-${index + 1}`, deps);
        
        // 🟢 ASOCIACIÓN DATA-DRIVEN: Si el spawn precalculado del nivel inyectó un groupId, lo asociamos
        if ((spawn as any).groupId) {
          enemy.groupId = (spawn as any).groupId;
        }
        
        manager.add(enemy);
      });
    }
  } catch (error) {
    manager.dispose(); 
    throw error;
  }
  return manager;
}

// ==========================================
// 3. ENEMIES MANAGER CORE
// ==========================================

export class EnemiesManager extends EventSubscriber {
  private readonly enemies: Enemy[] = [];
  private paused = false;
  private disposed = false;

  constructor() {
    super();
    this.registerEvents();
  }

  get count(): number {
    return this.enemies.length;
  }

  get aliveCount(): number {
    let alive = 0;
    for (const enemy of this.enemies) {
      if (enemy.isAlive) {
        alive++;
      }
    }
    return alive;
  }

  add<T extends Enemy>(enemy: T): T {
    if (this.disposed) {
      enemy.dispose();
    } else {
      this.enemies.push(enemy);
    }
    return enemy;
  }

  /**
   * 🟢 NUEVO MÉTODO CORE: Modifica la visibilidad y activa/desactiva frentes de colisión en lote
   */
  public setGroupStatus(groupId: string, enabled: boolean): void {
    if (this.disposed) return;

    this.enemies.forEach((enemy) => {
      // Filtramos de manera segura por coincidencia exacta o subcadena en el ID
      if (enemy.groupId === groupId || enemy.id.includes(groupId)) {
        
        // Obtenemos el TransformNode 'root' expuesto en la jerarquía del dron
        const rootNode = (enemy as any).root as TransformNode | undefined;
        if (rootNode && typeof rootNode.setEnabled === "function") {
          if (rootNode.isEnabled() !== enabled) {
            rootNode.setEnabled(enabled);
            
            // Si el dron posee mallas de debug asociadas (cono de visión), sincronizamos su visibilidad
            const debugCone = (enemy as any).debugConeMesh;
            if (debugCone) debugCone.isVisible = enabled;

            if (import.meta.env.DEV) {
              console.log(`[EnemiesManager] 🛸 Enemy Pool modificado: "${enemy.id}" -> setEnabled(${enabled})`);
            }
          }
        }
      }
    });
  }

  /**
   * Loop principal del Gameplay (Tick)
   */
  update(deltaTime: number, playerPosition: Vector3): void {
    if (this.paused || this.disposed) {
      return;
    }
    
    for (const enemy of this.enemies) {
      // 🟢 GUARDA DE SEGURIDAD ABSOLUTA PARA CPU:
      // Si el nodo raíz de Babylon fue apagado por el EntitiesController, saltamos su update por completo.
      // Esto congela su IA, detiene su máquina de estados (FSM) y anula raycasts costosos.
      const rootNode = (enemy as any).root as TransformNode | undefined;
      if (rootNode && !rootNode.isEnabled()) {
        continue; 
      }

      enemy.update(deltaTime, playerPosition);
    }
  }

  pause(): void {
    if (this.paused || this.disposed) {
      return;
    }
    this.paused = true;
    this.enemies.forEach((enemy) => enemy.pause());
  }

  resume(): void {
    if (!this.paused || this.disposed) {
      return;
    }
    this.paused = false;
    this.enemies.forEach((enemy) => enemy.resume());
  }

  gameOver(): void {
    if (this.disposed) {
      return;
    }
    this.enemies.forEach((enemy) => enemy.gameOver());
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.unsubscribeEvents();
    for (const enemy of this.enemies) {
      try {
        enemy.dispose();
      } catch (error) {
        console.error(`[EnemiesManager] failed to dispose the enemy "${enemy.id}"`, error);
      }
    }
    this.enemies.length = 0;
  }

  protected registerEvents(): void {
    this.listen(GameEvents.ProjectileHit, (hit) => this.onProjectileHit(hit));
  }

  private onProjectileHit(hit: ProjectileHitPayload): void {
    if (this.paused || this.disposed) {
      return;
    }
    if (hit.sourceId !== undefined) {
      return; 
    }
    this.enemies.find((enemy) => enemy.ownsMesh(hit.mesh))?.takeHit(hit);
  }
}
