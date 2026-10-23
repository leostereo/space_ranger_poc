import "@babylonjs/core/Rendering/outlineRenderer"; // habilita renderOverlay en los meshes
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";

import type { ProjectileHitPayload } from "@/game/services/event-manager";
import { EnemyBase } from "./enemy";
import type { EnemyDeps } from "./enemy-factory";

const DUMMY_WIDTH = 1.2;
const DUMMY_HEIGHT = 2;
const DUMMY_DEPTH = 0.2;
const DUMMY_MASS = 0; // estático: no se mueve ni cae
const DUMMY_FRICTION = 0.5;
const DUMMY_RESTITUTION = 0;
const DUMMY_HEALTH = 3; // con daño 1 por proyectil: 3 disparos

const HIT_FLASH_DURATION = 0.12; // segundos
const HIT_FLASH_COLOR = Color3.White();
const HIT_FLASH_ALPHA = 0.6;

/** Blanco de práctica: un rectángulo estático que recibe impactos, destella y se destruye al quedarse sin vida. */
export class DummyTarget extends EnemyBase {
  readonly mesh: Mesh;
  private readonly aggregate: PhysicsAggregate;
  private health = DUMMY_HEALTH;
  private flashRemaining = 0;
  private released = false;

  /** `spawn` es la base del blanco (a ras de suelo): el centro queda media altura más arriba. */
  constructor(id: string, spawn: Vector3, deps: EnemyDeps) {
    super(id, "dummyTarget");

    this.mesh = CreateBox(`enemy:${id}`, { width: DUMMY_WIDTH, height: DUMMY_HEIGHT, depth: DUMMY_DEPTH }, deps.scene);
    this.mesh.material = deps.registry.getMaterial("dummy-target");
    this.mesh.isPickable = true; // los proyectiles lo detectan por raycast
    this.mesh.position.set(spawn.x, spawn.y + DUMMY_HEIGHT / 2, spawn.z); // ANTES del aggregate: Havok toma la posición al construirlo
    this.mesh.overlayColor = HIT_FLASH_COLOR;
    this.mesh.overlayAlpha = HIT_FLASH_ALPHA;

    this.aggregate = new PhysicsAggregate(
      this.mesh,
      PhysicsShapeType.BOX,
      { mass: DUMMY_MASS, friction: DUMMY_FRICTION, restitution: DUMMY_RESTITUTION },
      deps.scene,
    );
  }

  ownsMesh(mesh: AbstractMesh): boolean {
    return mesh === this.mesh;
  }

  protected onHit(hit: ProjectileHitPayload): void {
    this.health -= hit.damage;
    if (import.meta.env.DEV) {
      console.info(`[DummyTarget] ${this.id}: vida ${Math.max(this.health, 0)}/${DUMMY_HEALTH}`);
    }

    if (this.health <= 0) {
      this.destroy();
      return;
    }
    this.flashRemaining = HIT_FLASH_DURATION;
    this.mesh.renderOverlay = true;
  }

  protected onUpdate(deltaTime: number, _playerPosition: Vector3): void {
    if (this.flashRemaining <= 0) {
      return;
    }
    this.flashRemaining -= deltaTime;
    if (this.flashRemaining <= 0) {
      this.mesh.renderOverlay = false;
    }
  }

  protected onDestroyed(): void {
    this.release();
  }

  protected onDispose(): void {
    this.release();
  }

  /** Suelta cuerpo y mesh una sola vez (puede llamarse al morir y de nuevo al liberar el nivel). */
  private release(): void {
    if (this.released) {
      return;
    }
    this.released = true;
    this.aggregate.dispose();
    this.mesh.dispose(); // el material es compartido: no se libera acá
  }
}