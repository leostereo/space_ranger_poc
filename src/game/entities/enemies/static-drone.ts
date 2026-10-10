import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Material } from "@babylonjs/core/Materials/material";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

import type { EnemySpawn } from "../../levels/level-definition";

import { EnemyBase } from "./enemy";
import type { EnemyDeps } from "./enemy-factory";
import { DEFAULT_PROJECTILE_WEAPON_CONFIG, ProjectileWeaponConfig, ProjectileWeaponController } from "../character/strategies/weapon/projectile-weapon.controller";

/** Distancia fija entre la base (suelo) y el centro del cuerpo. */
const HOVER_HEIGHT = 0.7;

const BODY_WIDTH = 0.5;
const BODY_HEIGHT = 0.15;
const BODY_DEPTH = 0.8; // el largo va sobre Z: el frente del dron es +Z local

// Cuatro hélices (torus acostados): dos a cada lado, pegadas al cuerpo.
const PROP_DIAMETER = 0.3;
const PROP_THICKNESS = 0.04;
const PROP_TESSELLATION = 24;
const PROP_CENTER_X = BODY_WIDTH / 2 + PROP_DIAMETER / 2;
const PROP_CENTER_Z = BODY_DEPTH * 0.3;

// Semiesfera bajo el cuerpo, de la que sale el cañón.
const DOME_DIAMETER = 0.24;
const DOME_SEGMENTS = 16;
const DOME_HALF = 0.5; // slice de Babylon: la mitad de la altura
const CANNON_DIAMETER = 0.05;
const CANNON_LENGTH = 0.3;
const CANNON_TESSELLATION = 12;
const CANNON_PIVOT_Y = -BODY_HEIGHT / 2 - (DOME_DIAMETER / 2) * 0.5; // dentro de la semiesfera

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

const resolveForward = (forward: Vector3 | undefined): Vector3 =>
  !forward || forward.lengthSquared() === 0 ? Vector3.Forward() : forward.normalizeToNew();

/**
 * Dron fijo: flota a una altura constante, no se mueve y dispara cada 3 segundos hacia su forward.
 * Más adelante: física, flotación, pitch y roll.
 */
export class StaticDrone extends EnemyBase {
  private readonly root: TransformNode;
  private readonly meshes: Mesh[] = [];
  private readonly weapon: ProjectileWeaponController;

  constructor(id: string, spawn: EnemySpawn, deps: EnemyDeps) {
    super(id, "staticDrone");
    const { scene, registry } = deps;
    const bodyMaterial = registry.getMaterial("static-drone-body");
    const accentMaterial = registry.getMaterial("static-drone-accent");
    const forward = resolveForward(spawn.forward);

    // El cuerpo gira solo en yaw; el cañón se inclina para apuntar exactamente al forward.
    this.root = new TransformNode(`enemy:${id}`, scene);
    this.root.position.set(spawn.position.x, spawn.position.y + HOVER_HEIGHT, spawn.position.z);
    this.root.rotation.y = Math.atan2(forward.x, forward.z);

    this.attach(CreateBox(`enemy:${id}:body`, { width: BODY_WIDTH, height: BODY_HEIGHT, depth: BODY_DEPTH }, scene), bodyMaterial);

    let propIndex = 0;
    for (const side of [-1, 1]) {
      for (const row of [-1, 1]) {
        const prop = CreateTorus(
          `enemy:${id}:prop${propIndex++}`,
          { diameter: PROP_DIAMETER, thickness: PROP_THICKNESS, tessellation: PROP_TESSELLATION },
          scene,
        );
        prop.position.set(side * PROP_CENTER_X, BODY_HEIGHT / 2, row * PROP_CENTER_Z);
        this.attach(prop, accentMaterial);
      }
    }

    // Semiesfera con la parte curva hacia abajo.
    const dome = CreateSphere(`enemy:${id}:dome`, { diameter: DOME_DIAMETER, slice: DOME_HALF, segments: DOME_SEGMENTS }, scene);
    dome.rotation.x = Math.PI;
    dome.position.y = -BODY_HEIGHT / 2;
    this.attach(dome, accentMaterial);

    // Cañón: un pivote (para inclinarlo) y un cilindro que sale hacia +Z.
    const cannonPivot = new TransformNode(`enemy:${id}:cannonPivot`, scene);
    cannonPivot.parent = this.root;
    cannonPivot.position.y = CANNON_PIVOT_Y;
    cannonPivot.rotation.x = -Math.asin(Math.max(-1, Math.min(1, forward.y)));

    const cannon = CreateCylinder(
      `enemy:${id}:cannon`,
      { diameter: CANNON_DIAMETER, height: CANNON_LENGTH, tessellation: CANNON_TESSELLATION },
      scene,
    );
    cannon.rotation.x = Math.PI / 2;
    cannon.position.z = CANNON_LENGTH / 2;
    this.attach(cannon, accentMaterial, cannonPivot);

    const muzzle = new TransformNode(`enemy:${id}:muzzle`, scene);
    muzzle.parent = cannonPivot;
    muzzle.position.z = CANNON_LENGTH;

    this.weapon = new ProjectileWeaponController(
      scene,
      muzzle,
      () => true, // el intervalo de 3 s lo marca la cadencia del arma
      this.meshes, // sus propios meshes no frenan sus proyectiles
      WEAPON_CONFIG,
      { sourceId: id, isExtraTarget: deps.isPlayerMesh },
    );
  }

  ownsMesh(mesh: AbstractMesh): boolean {
    return this.meshes.some((own) => own === mesh);
  }

  protected onUpdate(deltaTime: number): void {
    this.weapon.tick(deltaTime);
  }

  protected onDispose(): void {
    this.weapon.dispose(); // primero: el fogonazo es hijo del muzzle
    this.root.dispose(false, false); // los materiales son compartidos: no se liberan acá
  }

  private attach(mesh: Mesh, material: Material, parent: TransformNode = this.root): Mesh {
    mesh.parent = parent;
    mesh.material = material;
    this.meshes.push(mesh);
    return mesh;
  }
}