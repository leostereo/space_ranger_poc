import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateLines } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import type { EnemySpawn } from "../../levels/level-definition";
import { CHARACTER_CAPSULE_HEIGHT } from "../character/character.constants";
import { EnemyBase } from "./enemy";
import type { EnemyDeps } from "./enemy-factory";

const RAY_INTERVAL_SECONDS = 2;
const RAY_VISIBLE_SECONDS = 0.5;
const RAY_LENGTH = 20;
/** Altura del pecho respecto del suelo (el spawn es la base, igual que DummyTarget). */
const CHEST_HEIGHT = CHARACTER_CAPSULE_HEIGHT * 0.7;

const BODY_WIDTH = 0.2;
const BODY_HEIGHT = 0.2;
const BODY_DEPTH = 0.5; // el largo marca hacia dónde apunta

const COLOR_HIT_PLAYER = Color3.Red();
const COLOR_HIT_OTHER = new Color3(1, 0.6, 0.1);
const COLOR_MISS = Color3.Yellow();

/** Horizontal siempre: el rayo se mantiene a la altura del pecho. */
const resolveHorizontalForward = (forward: Vector3 | undefined): Vector3 => {
  if (!forward) return Vector3.Forward();
  const flat = new Vector3(forward.x, 0, forward.z);
  return flat.lengthSquared() === 0 ? Vector3.Forward() : flat.normalize();
};

/**
 * Enemigo de prueba: no recibe daño ni dispara proyectiles. Cada RAY_INTERVAL_SECONDS lanza un
 * raycast visible a la altura del pecho del Character y loguea qué alcanzó.
 */
export class RaycastDummy extends EnemyBase {
  private readonly scene: Scene;
  private readonly mesh: Mesh;
  private readonly line: LinesMesh;
  private readonly isPlayerMesh: (mesh: AbstractMesh) => boolean;
  private readonly origin: Vector3;
  private readonly direction: Vector3;
  private readonly ray: Ray;
  private elapsed = 0;
  private lineRemaining = 0;
  private released = false;

  constructor(id: string, spawn: EnemySpawn, deps: EnemyDeps) {
    super(id, "raycastDummy");
    this.scene = deps.scene;
    this.isPlayerMesh = deps.isPlayerMesh;
    this.direction = resolveHorizontalForward(spawn.forward);
    this.origin = new Vector3(spawn.position.x, spawn.position.y + CHEST_HEIGHT, spawn.position.z);
    this.ray = new Ray(this.origin, this.direction, RAY_LENGTH);

    this.mesh = CreateBox(`enemy:${id}`, { width: BODY_WIDTH, height: BODY_HEIGHT, depth: BODY_DEPTH }, deps.scene);
    this.mesh.material = deps.registry.getMaterial("dummy-target");
    this.mesh.isPickable = false; // ni frena proyectiles ni entra en el raycast de suelo del Character
    this.mesh.position.copyFrom(this.origin);
    this.mesh.rotation.y = Math.atan2(this.direction.x, this.direction.z);

    this.line = CreateLines(
      `enemy:${id}:ray`,
      { points: [this.origin.clone(), this.origin.add(this.direction.scale(RAY_LENGTH))], updatable: true },
      deps.scene,
    );
    this.line.isPickable = false;
    this.line.setEnabled(false);
  }

  ownsMesh(mesh: AbstractMesh): boolean {
    return mesh === this.mesh || mesh === this.line;
  }

  protected onUpdate(deltaTime: number): void {
    this.elapsed += deltaTime;
    if (this.elapsed >= RAY_INTERVAL_SECONDS) {
      this.elapsed = 0;
      this.castRay();
    }

    if (this.lineRemaining > 0) {
      this.lineRemaining -= deltaTime;
      if (this.lineRemaining <= 0) {
        this.line.setEnabled(false);
      }
    }
  }

  private castRay(): void {
    // El Character no es pickable a propósito: se lo acepta igual por isPlayerMesh.
    const hit = this.scene.pickWithRay(this.ray, (mesh) => mesh.isPickable || this.isPlayerMesh(mesh));

    const reached = !!hit?.hit;
    const distance = reached ? hit!.distance : RAY_LENGTH;
    const pickedMesh = hit?.pickedMesh ?? null;
    const hitPlayer = !!pickedMesh && this.isPlayerMesh(pickedMesh);

    this.showRay(distance, reached ? (hitPlayer ? COLOR_HIT_PLAYER : COLOR_HIT_OTHER) : COLOR_MISS);

    if (import.meta.env.DEV) {
      console.info(`[RaycastDummy] ${this.id}`, {
        hit: reached,
        hitPlayer,
        mesh: pickedMesh?.name ?? null,
        distance: Number(distance.toFixed(3)),
        point: hit?.pickedPoint?.asArray().map((n) => Number(n.toFixed(3))) ?? null,
        rayHeight: Number(this.origin.y.toFixed(3)),
      });
    }
  }

  private showRay(distance: number, color: Color3): void {
    CreateLines(
      this.line.name,
      { points: [this.origin, this.origin.add(this.direction.scale(distance))], instance: this.line },
      this.scene,
    );
    this.line.color = color;
    this.line.setEnabled(true);
    this.lineRemaining = RAY_VISIBLE_SECONDS;
  }

  protected onDestroyed(): void {
    this.release();
  }

  protected onDispose(): void {
    this.release();
  }

  private release(): void {
    if (this.released) return;
    this.released = true;
    this.line.dispose();
    this.mesh.dispose(); // el material es compartido: no se libera acá
  }
}