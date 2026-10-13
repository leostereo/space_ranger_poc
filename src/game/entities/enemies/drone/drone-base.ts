import "@babylonjs/core/Rendering/outlineRenderer"; // habilita renderOverlay en los meshes
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

import type { MaterialAssetKey } from "../../../assets/asset-keys";
import type { EnemySpawn, EnemyType } from "../../../levels/level-definition";
import type { ProjectileHitPayload } from "@/game/services/event-manager";



import { EnemyBase } from "../enemy";
import type { EnemyDeps } from "../enemy-factory";
import { buildDroneModel, DRONE_HOVER_HEIGHT } from "./drone-model";
import { DEFAULT_PROJECTILE_WEAPON_CONFIG, ProjectileWeaponConfig, ProjectileWeaponController } from "../../character/strategies/weapon/projectile-weapon.controller";

const DRONE_HEALTH = 3; // con daño 1 por proyectil: 3 disparos
const HIT_FLASH_DURATION = 0.12; // segundos
const HIT_FLASH_COLOR = Color3.White();
const HIT_FLASH_ALPHA = 0.6;

const FIRE_INTERVAL_SECONDS = 3;
const WEAPON_CONFIG: ProjectileWeaponConfig = {
  ...DEFAULT_PROJECTILE_WEAPON_CONFIG,
  fireRate: 1 / FIRE_INTERVAL_SECONDS,
  projectileSpeed: 10, // lento: se puede esquivar
  projectileLifetime: 8,
  projectileRadius: 0.04,
  projectileLength: 0.3,
  poolSize: 4,
  damage: 1,
  emissiveColor: new Color3(1, 0.45, 0.05),
  muzzleFlashScale: 0.12,
  impactPoolSize: 2,
};

const BODY_MATERIAL_KEY: MaterialAssetKey = "static-drone-body";

export interface DroneOptions {
  /** Material de las hélices, la semiesfera y el cañón. */
  readonly accentMaterial: MaterialAssetKey;
  /** true: el cañón se inclina para apuntar exacto al forward. false: dispara en horizontal. */
  readonly pitchToForward: boolean;
  /** true: `spawn.position` es el centro del dron (vuela en un volumen). false (por defecto): es la base y se suma DRONE_HOVER_HEIGHT. */
  readonly spawnAtExactPosition?: boolean;
  /** false: el dron no dispara. Por defecto, true. */
  readonly armed?: boolean;
}

const resolveForward = (forward: Vector3 | undefined): Vector3 =>
  !forward || forward.lengthSquared() === 0 ? Vector3.Forward() : forward.normalizeToNew();

/**
 * Lo común de los drones: modelo, arma que dispara cada 3 segundos, vida, destello al recibir daño
 * y destrucción. Cada dron agrega su comportamiento en `onThink`.
 */
export abstract class DroneBase extends EnemyBase {
  /** Posición y yaw del dron. */
  protected readonly root: TransformNode;
  /** Para efectos visuales (flotación, pitch, roll); cuelga de root. */
  protected readonly visual: TransformNode;
  private readonly meshes: Mesh[];
  private readonly weapon: ProjectileWeaponController;
  private health = DRONE_HEALTH;
  private flashRemaining = 0;
  private released = false;
  private readonly armed: boolean;

  constructor(id: string, type: EnemyType, spawn: EnemySpawn, deps: EnemyDeps, options: DroneOptions) {
    super(id, type);
    this.armed = options.armed ?? true;

    const position = options.spawnAtExactPosition
      ? spawn.position.clone()
      : new Vector3(spawn.position.x, spawn.position.y + DRONE_HOVER_HEIGHT, spawn.position.z);
    const model = buildDroneModel(
      deps.scene,
      id,
      {
        body: deps.registry.getMaterial(BODY_MATERIAL_KEY),
        accent: deps.registry.getMaterial(options.accentMaterial),
      },
      position,
      resolveForward(spawn.forward),
      options.pitchToForward,
    );
    this.root = model.root;
    this.visual = model.visual;
    this.meshes = model.meshes;

    for (const mesh of this.meshes) {
      mesh.overlayColor = HIT_FLASH_COLOR;
      mesh.overlayAlpha = HIT_FLASH_ALPHA;
    }

    this.weapon = new ProjectileWeaponController(
      deps.scene,
      model.muzzle,
      () => true, // el intervalo de 3 s lo marca la cadencia del arma
      this.meshes, // sus propios meshes no frenan sus proyectiles
      WEAPON_CONFIG,
      { sourceId: id, isExtraTarget: deps.isPlayerMesh },
    );
  }

  ownsMesh(mesh: AbstractMesh): boolean {
    return this.meshes.some((own) => own === mesh);
  }

  /** Comportamiento propio del dron (movimiento, etc.). Corre antes del arma, en cada frame. */
  protected onThink(_deltaTime: number): void {}

  protected onUpdate(deltaTime: number): void {
    this.onThink(deltaTime);
    if (this.armed) {
      this.weapon.tick(deltaTime);
    }

    if (this.flashRemaining > 0) {
      this.flashRemaining -= deltaTime;
      if (this.flashRemaining <= 0) {
        this.setFlash(false);
      }
    }
  }

  protected onHit(hit: ProjectileHitPayload): void {
    this.health -= hit.damage;
    if (import.meta.env.DEV) {
      console.info(`[${this.type}] ${this.id}: vida ${Math.max(this.health, 0)}/${DRONE_HEALTH}`);
    }

    if (this.health <= 0) {
      this.destroy();
      return;
    }
    this.flashRemaining = HIT_FLASH_DURATION;
    this.setFlash(true);
  }

  protected onDestroyed(): void {
    this.release();
  }

  protected onDispose(): void {
    this.release();
  }

  /** Suelta arma y mallas una sola vez (puede llamarse al morir y de nuevo al liberar el nivel). */
  private release(): void {
    if (this.released) {
      return;
    }
    this.released = true;
    this.weapon.dispose(); // primero: el fogonazo es hijo del muzzle
    this.root.dispose(false, false); // los materiales son compartidos: no se liberan acá
  }

  private setFlash(on: boolean): void {
    for (const mesh of this.meshes) {
      mesh.renderOverlay = on;
    }
  }
}