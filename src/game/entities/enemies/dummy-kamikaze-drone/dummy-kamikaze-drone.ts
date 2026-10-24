import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Ray } from "@babylonjs/core/Culling/ray";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

// Imports de infraestructura del juego
import { EventManager, GameEvents } from "@/game/services/event-manager"; // 🟢 EventManager global
import type { EnemySpawn } from "../../../levels/level-definition";
import type { NavigationService } from "../../../navigation/navigation-service";
import type { PatrolRegion } from "../../../navigation/patrol-region";
import { createPatrolVolumeDebug, type PatrolVolumeDebug } from "../debug/patrol-volume-debug";
import { DroneBase } from "../drone/drone-base";
import type { EnemyDeps } from "../enemy-factory";
import { DummyKamikazeFsm } from "./dummy-kamikaze.fsm";
import { DummyKamikazeMovementController } from "./dummy-kamikaze-movement.controller";
import { buildDroneModelKamikaze } from "../drone/drone-model-kamikaze";
import { ExplosionFX } from "@/game/utils/explosion-fx"

const DETECT_RADIUS = 18.0;
const FOV_ANGLE_DEGREES = 75.0;
const VISION_PLANE_Y = 1.0;
const IMPACT_RAY_LENGTH = 0.5;      // Largo del percutor frontal corto
const EXPLOSION_DAMAGE = 1;
const MIN_DAMAGE_DISTANCE = 1.8;     // 🟢 Radio de la explosión esférica para alcanzar al jugador

const DEBUG_CONE_SEGMENTS = 16;
const DEBUG_CONE_COLOR = new Color3(1, 0.45, 0);

export class DummyKamikazeDrone extends DroneBase {
  private readonly navigation: NavigationService;
  private readonly region: PatrolRegion | undefined;
  private readonly movement: DummyKamikazeMovementController;
  private readonly fsm: DummyKamikazeFsm;

  private readonly destination = new Vector3();
  private loseTargetTimer = 0;

  // Manejo interno del payload de impacto a despachar
  private collisionPayload: { hitMesh: AbstractMesh; type: "player" | "shield" | "environment" } | null = null;
  private lastKnownPlayerPos = new Vector3();
  private volumeDebug: PatrolVolumeDebug | null = null;
  private debugConeMesh: LinesMesh | null = null;
  private readonly debugConePoints: Vector3[] = [];

  constructor(id: string, spawn: EnemySpawn, deps: EnemyDeps) {
    super(id, "dummyKamikazeDrone", spawn, deps, {
      accentMaterial: "sentinel-drone-accent",
      pitchToForward: true,
      spawnAtExactPosition: true,
      armed: false,
      customModelBuilder: buildDroneModelKamikaze
    });

    this.navigation = deps.navigation;
    this.region = spawn.patrol;

    this.movement = new DummyKamikazeMovementController(this.root, this.visual);

    if (this.region?.volume) {
      this.volumeDebug = createPatrolVolumeDebug(deps.scene, id, this.region.volume);
    }

    this.initDebugCone(deps.scene);

    this.fsm = new DummyKamikazeFsm({
      onEnterPatrol: () => {
        this.movement.setSpeedMultiplier(1.0);
        this.pickPatrolDestination();
      },
      onEnterSpotting: () => {
        this.movement.stop();
        this.fsm.setStateTimer(0.6);
      },
      onEnterChasing: () => {
        this.loseTargetTimer = 0;
        this.collisionPayload = null;
        this.movement.setSpeedMultiplier(3.5); // 🟢 VELOCIDAD AGRESIVA SOLICITADA
      },
      onEnterCharging: () => {
        this.fsm.setStateTimer(0.4);
      },
      onEnterReturning: () => {
        this.movement.setSpeedMultiplier(1.0);
        this.pickReturnWaypoint();
      },
      onEnterExploding: () => {
        // Al entrar en explosión, si tenemos un objeto colisionado, despachamos el evento
        if (this.collisionPayload) {
          this.dispatchImpactEvent();
        }
        // 🟢 SPRAWNEO DEL EFECTO VISUAL:
        // Pasamos la escena, la posición actual del root del dron y la textura de partículas heredada
        // ExplosionFX.spawn(deps.scene, this.root.position, deps.registry.getTexture("flare"));
        this.destroy();
      },
    });

    this.fsm.start();
  }

  protected override onThink(deltaTime: number, playerPosition: Vector3): void {
    this.lastKnownPlayerPos.copyFrom(playerPosition); // 🟢 Guardamos la referencia limpia
    this.fsm.tick(deltaTime);
    this.processBehavior(deltaTime, playerPosition);
    this.updateDebugCone();
    this.movement.update(deltaTime);
  }

  private processBehavior(deltaTime: number, playerPos: Vector3): void {
    const currentState = this.fsm.state;

    switch (currentState) {
      case "Patrol":
        if (this.checkPlayerInPlaneCone(playerPos)) {
          this.fsm.transitionTo("Spotting");
        } else if (this.movement.isIdle) {
          this.pickPatrolDestination();
        }
        break;

      case "Spotting":
        this.movement.lookAt(playerPos, false); // Persigue la posición 3D

        if (this.fsm.stateTimer <= 0) {
          if (this.checkPlayerInPlaneCone(playerPos)) {
            this.fsm.transitionTo("Chasing");
          } else {
            this.fsm.transitionTo("Patrol");
          }
        }
        break;

      case "Chasing":
        this.movement.moveTo(playerPos);

        // El raycast ahora actúa puramente como un detonador por proximidad física/obstáculo
        const hitData = this.evaluateImpactRaycast();
        if (hitData) {
          this.collisionPayload = hitData;
          this.fsm.transitionTo("Exploding"); // Detonación inmediata ante cualquier impacto
          return;
        }

        if (!this.checkPlayerInPlaneCone(playerPos)) {
          this.loseTargetTimer += deltaTime;
          if (this.loseTargetTimer >= 2.0) {
            this.fsm.transitionTo("Returning");
          }
        } else {
          this.loseTargetTimer = 0;
        }
        break;

      case "Charging":
        if (this.fsm.stateTimer <= 0) {
          this.fsm.transitionTo("Exploding");
        }
        break;

      case "Returning":
        if (this.checkPlayerInPlaneCone(playerPos)) {
          this.fsm.transitionTo("Spotting");
        } else if (this.movement.isIdle) {
          this.fsm.transitionTo("Patrol");
        }
        break;
    }
  }

  private checkPlayerInPlaneCone(playerPos: Vector3): boolean {
    const origin = this.root.position;
    if (Vector3.Distance(origin, playerPos) > DETECT_RADIUS) {
      return false;
    }

    const forwardXZ = new Vector3(this.root.forward.x, 0, this.root.forward.z).normalize().scale(-1);
    const toTargetXZ = new Vector3(playerPos.x - origin.x, 0, playerPos.z - origin.z).normalize();

    const dot = Vector3.Dot(forwardXZ, toTargetXZ);
    const angleDegrees = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);

    return angleDegrees <= FOV_ANGLE_DEGREES / 2;
  }

  /**
   * Examina la escena utilizando el percutor frontal e identifica el tipo de colisión.
   */
  private evaluateImpactRaycast(): { hitMesh: AbstractMesh; type: "player" | "shield" | "environment" } | null {
    const scene = this.root.getScene();
    const forwardDirection = new Vector3(this.root.forward.x, this.root.forward.y, this.root.forward.z).normalize().scale(-1);
    const ray = new Ray(this.root.position, forwardDirection, IMPACT_RAY_LENGTH);

    const hit = scene.pickWithRay(ray, (mesh) => {
      return !this.ownsMesh(mesh) && (mesh.checkCollisions || mesh.name.includes("shield") || mesh.name.includes("character"));
    });

    if (hit && hit.hit && hit.pickedMesh) {
      const meshName = hit.pickedMesh.name.toLowerCase();

      if (meshName.includes("shield")) {
        return { hitMesh: hit.pickedMesh, type: "shield" };
      }
      if (meshName.includes("character") || meshName.includes("player")) {
        return { hitMesh: hit.pickedMesh, type: "player" };
      }
      if (hit.pickedMesh.checkCollisions) {
        return { hitMesh: hit.pickedMesh, type: "environment" };
      }
    }
    return null;
  }

  /**
   * Publica el evento KamikazeImpact al EventManager centralizado del motor.
   */
  private dispatchImpactEvent(): void {
    // Calculamos la distancia real tridimensional entre el origen del dron y el jugador
    const distanceToPlayer = Vector3.Distance(this.root.position, this.lastKnownPlayerPos);

    if (import.meta.env.DEV) {
      console.log(`[DummyKamikazeDrone] Detonación iniciada. Distancia al objetivo: ${distanceToPlayer.toFixed(2)}m`);
    }

    // 🟢 VALIDACIÓN DE PROXIMIDAD RADIAL
    if (distanceToPlayer <= MIN_DAMAGE_DISTANCE) {
      if (import.meta.env.DEV) {
        console.warn(`[DummyKamikazeDrone] Objetivo dentro del radio de daño (<= ${MIN_DAMAGE_DISTANCE}m). Emitiendo ProjectileHit.`);
      }

      const forwardDirection = new Vector3(this.root.forward.x, this.root.forward.y, this.root.forward.z).normalize().scale(-1);

      // Emitimos usando el EventManager exacto del ProjectileWeaponController
      EventManager.emit(GameEvents.KamikazeImpact, {
        damage: EXPLOSION_DAMAGE,
        direction: forwardDirection,
        sourceId: this.id,
        position: this.root.position.clone(), // 🟢 Clonado para evitar mutaciones
        hitMesh: this.collisionPayload!.hitMesh
      });

    } else {
      if (import.meta.env.DEV) {
        console.log(`[DummyKamikazeDrone] Detonación neutralizada de forma remota (Objetivo fuera de rango).`);
      }
    }
  }

  private pickPatrolDestination(): void {
    const point = this.region ? this.navigation.getRandomPoint(this.region, this.destination) : null;
    if (point) this.movement.moveTo(point);
    else this.movement.wait(1.0);
  }

  private pickReturnWaypoint(): void {
    if (this.region?.volume?.center) this.movement.moveTo(this.region.volume.center);
    else this.fsm.transitionTo("Patrol");
  }

  private initDebugCone(scene: any): void {
    const totalPoints = DEBUG_CONE_SEGMENTS + 2;
    for (let i = 0; i < totalPoints; i++) this.debugConePoints.push(new Vector3());

    this.debugConeMesh = MeshBuilder.CreateLines("debugCone_" + this.id, {
      points: this.debugConePoints,
      updatable: true
    }, scene);

    this.debugConeMesh.color = DEBUG_CONE_COLOR;
    this.debugConeMesh.isPickable = false;
  }

  private updateDebugCone(): void {
    if (!this.debugConeMesh) return;

    const centerOrigin = new Vector3(this.root.position.x, VISION_PLANE_Y, this.root.position.z);
    this.debugConePoints[0].copyFrom(centerOrigin);

    const baseForward = new Vector3(this.root.forward.x, 0, this.root.forward.z).normalize().scale(-1);
    const halfFovRad = (FOV_ANGLE_DEGREES / 2) * (Math.PI / 180);

    for (let i = 0; i <= DEBUG_CONE_SEGMENTS; i++) {
      const ratio = i / DEBUG_CONE_SEGMENTS;
      const currentAngle = -halfFovRad + (ratio * (halfFovRad * 2));
      const cos = Math.cos(currentAngle);
      const sin = Math.sin(currentAngle);
      const rotatedDir = new Vector3(
        baseForward.x * cos - baseForward.z * sin,
        0,
        baseForward.x * sin + baseForward.z * cos
      ).normalize();
      this.debugConePoints[i + 1].copyFrom(centerOrigin.add(rotatedDir.scale(DETECT_RADIUS)));
    }
    this.debugConePoints[this.debugConePoints.length - 1].copyFrom(centerOrigin);
    MeshBuilder.CreateLines("debugCone_" + this.id, {
      points: this.debugConePoints,
      instance: this.debugConeMesh
    });
  }
  private releaseDebug(): void {
    this.volumeDebug?.dispose();
    this.volumeDebug = null;
    this.debugConeMesh?.dispose();
    this.debugConeMesh = null;
  }

  protected override onDestroyed(): void {
  // 1. Spawneamos la explosión pasando UNICAMENTE la posición real
  if (this.root && !this.root.isDisposed()) {
    ExplosionFX.spawn(this.root.position);
  }

  // 2. Liberamos los componentes de debug del volumen de navegación
  this.releaseDebug();

  // 3. Pasamos el control a la clase base
  super.onDestroyed();
}

  protected override onDispose(): void { this.fsm.dispose(); this.releaseDebug(); super.onDispose(); }
}
