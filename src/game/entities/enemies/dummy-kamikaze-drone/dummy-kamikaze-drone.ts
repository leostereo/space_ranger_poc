// src/game/entities/enemies/dummy-kamikaze-drone/dummy-kamikaze-drone.ts
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Ray } from "@babylonjs/core/Culling/ray";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

// Imports de infraestructura del juego
import { EventManager, GameEvents } from "@/game/services/event-manager";
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
import type { ProjectileHitPayload } from "@/game/services/event-manager";
import { DroneSmokeTrail } from "../drone/drone-smoke-trail";

const DETECT_RADIUS = 18.0;
const FOV_ANGLE_DEGREES = 75.0;
const VISION_PLANE_Y = 1.0;
const IMPACT_RAY_LENGTH = 0.5;
const EXPLOSION_DAMAGE = 1;
const MIN_DAMAGE_DISTANCE = 1.8;

const DEBUG_CONE_SEGMENTS = 16;
const DEBUG_CONE_COLOR = new Color3(1, 0.45, 0);
const DISPLAY_DEBUG_CONE = false;
const DISPLAY_DEBUG_VOLUME = false;

// 🟢 CONFIGURACIÓN CINEMATOGRÁFICA DE DERRIBO
const FALL_GRAVITY = 9.8;           // Velocidad de caída metros/segundo al cuadrado
const FALL_TIME_LIMIT_SECONDS = 3.0;// Tiempo parametrizable de descarte defensivo

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

  // Vector interno para conservar la inercia lineal del dron al momento de caer herido
  private readonly fallVelocity = new Vector3();
  private _smokeTrail: DroneSmokeTrail | null = null;

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

    if (this.region?.volume && DISPLAY_DEBUG_VOLUME && import.meta.env.DEV) {
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
        this.movement.setSpeedMultiplier(3.5);
      },
      onEnterCharging: () => {
        this.fsm.setStateTimer(0.4);
      },
      onEnterReturning: () => {
        this.movement.setSpeedMultiplier(1.0);
        this.pickReturnWaypoint();
      },
      onEnterExploding: () => {
        if (this.collisionPayload) {
          this.dispatchImpactEvent();
        }
        this.destroy(); // Ejecuta onDestroyed (ExplosionFX.spawn) y libera recursos
      },
      onEnterShooted: () => {
        // 🟢 ACCIÓN DE ENTRADA: DRONE ABATIDO
        this.movement.stop(); // Frena el empuje de la IA de navegación estándar
        this.fsm.setStateTimer(FALL_TIME_LIMIT_SECONDS); // Inicializa contador de autodestrucción (3s)

        // Conservamos la inercia del movimiento que traía el root en el plano horizontal
        if (this.root.forward) {
          // Calculamos dirección de avance multiplicada por su velocidad inercial aproximada
          const speedFactor = this.fsm.state === "Chasing" ? 8.0 : 3.0;
          this.fallVelocity.copyFrom(this.root.forward.scale(-speedFactor));
        }
        this.fallVelocity.y = 0; // El eje Y comenzará a acelerar por gravedad en el loop

        // 🟢 PLACEHOLDER PROPULSOR: Trigger inicial para el humo gris/negro de avería
        if (import.meta.env.DEV) {
          console.log(`[DummyKamikazeDrone] ${this.id} herido. Humo de propulsor encendido.`);
        }

        this._smokeTrail = new DroneSmokeTrail(deps.scene, this.visual, deps.registry.getTexture("flare"));

      }
    });

    this.fsm.start();
  }

  /**
   * 🟢 FILTRO INTERCEPTOR DE DISPAROS DEL JUGADOR
   * Ignoramos el flujo de daño escalable de la clase base: un solo impacto lo derriba.
   */
  protected override onHit(hit: ProjectileHitPayload): void {
    if (this.fsm.state === "Shooted" || this.fsm.state === "Exploding") return;

    if (import.meta.env.DEV) {
      console.warn(`[DummyKamikazeDrone] ${this.id} impactado por proyectil en posición Z: ${this.root.position.z.toFixed(1)}. Iniciando caída libre.`);
    }

    // 🟢 REUTILIZACIÓN DE EFECTO ESTÉTICO:
    // Activamos el render overlay blanco al máximo de forma instantánea para dar el "impact feel" del DummyTarget
    this.setFlash(true);

    // Forzamos la transición a la caída inercial echando humo
    this.fsm.transitionTo("Shooted");
  }

  protected override onThink(deltaTime: number, playerPosition: Vector3): void {
    this.lastKnownPlayerPos.copyFrom(playerPosition);
    this.fsm.tick(deltaTime);
    this.processBehavior(deltaTime, playerPosition);
    this.updateDebugCone();

    // Solo aplicamos actualizaciones lógicas de navegación si NO está cayendo destruido
    if (this.fsm.state !== "Shooted") {
      this.movement.update(deltaTime);
    }
  }

  private processBehavior(deltaTime: number, playerPos: Vector3): void {
    const currentState = this.fsm.state;


    // COMPORTAMIENTO EXCLUSIVO EN CAÍDA LIBRE (Mecánicas A y B)
    if (currentState === "Shooted") {
      // Aplicamos gravedad acumulativa sobre nuestro vector inercial en el eje Y
      this.fallVelocity.y -= FALL_GRAVITY * deltaTime;

      // Desplazamos el TransformNode físico en base a la velocidad compuesta
      this.root.position.addInPlace(this.fallVelocity.scale(deltaTime));

      // Hacemos que el dron cabecee o gire de manera errática sobre sus ejes visuales
      this.visual.rotate(Vector3.Right(), 2.5 * deltaTime);
      this.visual.rotate(Vector3.Up(), 1.5 * deltaTime);

      // 🟢 FIX DE DETECCIÓN: Evaluamos el percutor vertical extendido en caída libre
      const hitData = this.evaluateImpactRaycast();
      if (hitData) {
        // 1. Guardamos la malla del entorno chocada para la lógica del evento (ej: plank o rail)
        this.collisionPayload = hitData;

        // 2. Transicionamos inmediatamente a la explosión cinematográfica cortando la caída
        this.fsm.transitionTo("Exploding");
        return;
      }

      // Mecánica B: Si transcurren los 3 segundos en el vacío sin chocar, se inmola limpiamente
      if (this.fsm.stateTimer <= 0) {
        if (import.meta.env.DEV) {
          console.log(`[DummyKamikazeDrone] Límite de tiempo en caída alcanzado (${FALL_TIME_LIMIT_SECONDS}s). Inmolación defensiva.`);
        }
        this.fsm.transitionTo("Exploding");
      }

      if (this._smokeTrail) this._smokeTrail.update();

      return; // Salta el resto de la IA de persecución estándar
    }

    switch (currentState) {
      case "Patrol":
        if (this.checkPlayerInPlaneCone(playerPos)) {
          this.fsm.transitionTo("Spotting");
        } else if (this.movement.isIdle) {
          this.pickPatrolDestination();
        }
        break;

      case "Spotting":
        this.movement.lookAt(playerPos, false);

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

        const hitData = this.evaluateImpactRaycast();
        if (hitData) {
          this.collisionPayload = hitData;
          this.fsm.transitionTo("Exploding");
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

  private evaluateImpactRaycast(): { hitMesh: AbstractMesh; type: "player" | "shield" | "environment" } | null {
    const scene = this.root.getScene();

    let rayOrigin = this.root.position.clone();
    let rayDirection = new Vector3(this.root.forward.x, this.root.forward.y, this.root.forward.z).normalize().scale(-1);
    let rayLength = IMPACT_RAY_LENGTH;

    if (this.fsm.state === "Shooted") {
      rayOrigin.y += 1.0;
      rayDirection.set(0, -1, 0); // Rayo vertical hacia abajo
      rayLength = 1;
    }

    const ray = new Ray(rayOrigin, rayDirection, rayLength);

    const hit = scene.pickWithRay(ray, (mesh) => {
      if (this.ownsMesh(mesh)) return false;
      const meshName = mesh.name.toLowerCase();

      // Criterio de aceptación en caída libre
      if (this.fsm.state === "Shooted") {
        if (meshName.includes("bridge") || meshName.includes("track") || meshName.includes("floor") || meshName.includes("platform")) {
          return true;
        }
      }

      if (meshName.includes("hitbox")) return true;
      if (meshName.includes("shield")) {
        const isParentActive = mesh.parent ? mesh.parent.isEnabled() : true;
        return isParentActive && mesh.isEnabled() && mesh.isVisible;
      }

      return mesh.checkCollisions;
    });

    if (hit && hit.hit && hit.pickedMesh) {
      const meshName = hit.pickedMesh.name.toLowerCase();

      // 🟢 CORRECCIÓN: Si estamos en caída libre y es una pieza del escenario,
      // retornamos el impacto inmediatamente eludiendo la verificación de checkCollisions de Babylon
      if (this.fsm.state === "Shooted") {
        if (meshName.includes("bridge") || meshName.includes("track") || meshName.includes("floor") || meshName.includes("platform")) {
          return { hitMesh: hit.pickedMesh, type: "environment" };
        }
      }

      if (meshName.includes("shield")) return { hitMesh: hit.pickedMesh, type: "shield" };
      if (meshName.includes("character") || meshName.includes("player")) return { hitMesh: hit.pickedMesh, type: "player" };

      if (hit.pickedMesh.checkCollisions) {
        return { hitMesh: hit.pickedMesh, type: "environment" };
      }
    }
    return null;
  }

  private dispatchImpactEvent(): void {
    const distanceToPlayer = Vector3.Distance(this.root.position, this.lastKnownPlayerPos);
    if (distanceToPlayer <= MIN_DAMAGE_DISTANCE) {
      if (import.meta.env.DEV) {
        console.warn(`[DummyKamikazeDrone] Objetivo dentro del radio de daño (<= ${MIN_DAMAGE_DISTANCE}m). Emitiendo ProjectileHit.`);
      }
      const forwardDirection = new Vector3(this.root.forward.x, this.root.forward.y, this.root.forward.z).normalize().scale(-1);
      EventManager.emit(GameEvents.KamikazeImpact, {
        damage: EXPLOSION_DAMAGE,
        direction: forwardDirection,
        sourceId: this.id,
        position: this.root.position.clone(),
        hitMesh: this.collisionPayload!.hitMesh
      });
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
    if (!DISPLAY_DEBUG_CONE || !import.meta.env.DEV) return;
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
    if (!this.root.isEnabled()) {
      this.debugConeMesh.isVisible = false;
      return;
    }
    this.debugConeMesh.isVisible = true;
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
    if (this.root && !this.root.isDisposed()) {
      ExplosionFX.spawn(this.root.position);
    }
    if (this._smokeTrail) {
      this._smokeTrail.stop();
      this._smokeTrail = null;
    }
    this.releaseDebug();
    super.onDestroyed();
  }
  protected override onDispose(): void {
    this.fsm.dispose();
    this.releaseDebug(); super.onDispose();
    if (this._smokeTrail) {
      this._smokeTrail.stop();
      this._smokeTrail = null;
    }
  }
}