import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Ray } from "@babylonjs/core/Culling/ray";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import type { Scene } from "@babylonjs/core/scene";
import { ExplosionFX } from "@/game/utils/explosion-fx";
import { DroneBase } from "../drone-base";
import { StaticDroneFsm } from "./static-drone.fsm";
import { EnemySpawn } from "@/game/levels/level-definition";
import { EnemyDeps } from "../../enemy-factory";
import { Space } from "@babylonjs/core/Maths/math.axis";
import { buildDroneModelStatic } from "../drone-model-static";

// --- PARÁMETROS CONFIGURABLES DEL STATIC DRONE ---
const HOVER_HEIGHT_ABOVE_SURFACE = 1;   // Altura parametrizable sobre el suelo u obstáculo
const PROBE_MAX_DISTANCE = 16.0;        // Distancia máxima de escaneo de entorno
const CORRIDOR_THRESHOLD_DIST = 4.5;    // Si los lados están a menos de 4.5m, acota el barrido (pasillo)

const OPEN_SCAN_HALF_ANGLE_DEG = 60.0;  // Barrido horizontal en campo abierto (±60°)
const NARROW_SCAN_HALF_ANGLE_DEG = 22.0;// Barrido horizontal en pasillo/esquina (±22°)
const SCAN_SPEED_RAD_PER_SEC = 1.1;     // Velocidad de oscilación de patrulla
const FIXED_VERTICAL_PITCH_DEG = -12.0; // Ángulo vertical fijo (negativo = mira ligeramente hacia abajo)

const DETECT_RADIUS = 60.0;
const FOV_ANGLE_DEGREES = 65.0;       // Amplitud del cono de detección
const LOSE_TARGET_DELAY_SECONDS = 1.5;  // Tiempo antes de volver a patrullar si pierde visión

// --- DEBUG CONO DE VISIÓN (Apagar al finalizar ajustes) ---
const DISPLAY_DEBUG_CONE = false;
const DEBUG_CONE_SEGMENTS = 14;
const DEBUG_CONE_SCAN_COLOR = new Color3(0.2, 0.85, 1.0);
const DEBUG_CONE_ALERT_COLOR = new Color3(1.0, 0.2, 0.2);
const PLAYER_TORSO_OFFSET_Y = 0.2;

export class StaticDrone extends DroneBase {
  private readonly fsm: StaticDroneFsm;
  private baseForward = new Vector3(0, 0, -1);
  private currentLookDir = new Vector3(0, 0, -1);
  private scanHalfAngleRad = (OPEN_SCAN_HALF_ANGLE_DEG * Math.PI) / 180;
  private scanPhase = 0;
  private loseTargetTimer = 0;

  private debugConeMesh: LinesMesh | null = null;
  private readonly debugConePoints: Vector3[] = [];
  private is360Patrol = false;

  constructor(id: string, spawn: EnemySpawn, deps: EnemyDeps) {
    // Usamos arrow function para referenciar `this.fsm` recién creado abajo
    let fsmRef: StaticDroneFsm;

    super(id, "staticDrone", spawn, deps, {
      accentMaterial: "static-drone-accent",
      pitchToForward: true,
      spawnAtExactPosition: true,
      armed: true,
      customModelBuilder: buildDroneModelStatic,
      canFire: () => fsmRef?.state === "Engaging",
      weaponConfig: {
        fireRate: 0.8,          // Cadencia de disparo (~1 tiro cada 0.8s)
        projectileSpeed: 40,    // Velocidad más rápida (antes 22, base 10)
        projectileLifetime: 4,  // Libera balas del pool más rápido al viajar lejos
        poolSize: 8,
      },
    });

    this.initDebugCone(deps.scene);

    fsmRef = new StaticDroneFsm({
      onEnterOrienting: () => {
        this.calibratePositionAndForward(deps.scene);
        this.fsm.transitionTo("Scanning");
      },
      onEnterScanning: () => {
        this.loseTargetTimer = 0;
        if (this.debugConeMesh) {
          this.debugConeMesh.color = DEBUG_CONE_SCAN_COLOR;
        }
      },
      onEnterEngaging: () => {
        this.loseTargetTimer = 0;
        if (this.debugConeMesh) {
          this.debugConeMesh.color = DEBUG_CONE_ALERT_COLOR;
        }
      },
      onEnterExploding: () => {
        this.destroy(); // Explota en el lugar sin caída libre
      },
    });

    this.fsm = fsmRef;
    this.fsm.start();
  }

  protected override onThink(deltaTime: number, playerPosition: Vector3): void {
    // Si el dron todavía no fue habilitado por culling en la escena, no procesamos raycasts
    if (!this.root.isEnabled()) return;

    this.fsm.tick(deltaTime);

    switch (this.fsm.state) {
      case "Orienting":
        // Se resuelve instantáneamente en onEnterOrienting
        break;

      case "Scanning":
        this.updateScanningRotation(deltaTime);
        if (this.canSeePlayer(playerPosition)) {
          this.fsm.transitionTo("Engaging");
        }
        break;

      case "Engaging":
        this.aimAtTarget(playerPosition, deltaTime);

        if (!this.canSeePlayer(playerPosition)) {
          this.loseTargetTimer += deltaTime;
          if (this.loseTargetTimer >= LOSE_TARGET_DELAY_SECONDS) {
            this.fsm.transitionTo("Scanning");
          }
        } else {
          this.loseTargetTimer = 0;
        }
        break;

      case "Exploding":
        break;
    }

    this.updateDebugCone();
  }

  /**
   * 1. Ajusta altura sobre la superficie inferior (suelo u obstáculo).
   * 2. Define el forward en 2 etapas:
   *    - Etapa 1: 8 rayos cada 45° para detectar el sector más despejado.
   *    - Etapa 2: 3 rayos finos (-15°, 0°, +15°) alrededor del ganador.
   */
  private calibratePositionAndForward(scene: Scene): void {
    // A. Ajuste de altura sobre el suelo o bloque inferior
    const downRay = new Ray(this.root.position.add(new Vector3(0, 1.0, 0)), Vector3.Down(), 25.0);
    const floorHit = scene.pickWithRay(downRay, (mesh) => !this.ownsMesh(mesh) && mesh.checkCollisions);
    if (floorHit && floorHit.hit && floorHit.pickedPoint) {
      this.root.position.y = floorHit.pickedPoint.y + HOVER_HEIGHT_ABOVE_SURFACE;
    }

    const probeOrigin = this.root.position.clone();
    const castHorizontalProbe = (angleRad: number): number => {
      const dir = new Vector3(Math.sin(angleRad), 0, Math.cos(angleRad));
      const ray = new Ray(probeOrigin, dir, PROBE_MAX_DISTANCE);
      const hit = scene.pickWithRay(ray, (mesh) => !this.ownsMesh(mesh) && mesh.checkCollisions);
      return hit && hit.hit ? hit.distance : PROBE_MAX_DISTANCE;
    };

    // B. Etapa 1: Barrido cada 45° arrancando desde 180° (-Z, interior de la arena)
    const coarseDistances: number[] = [];
    let bestCoarseAngle = Math.PI; // -Z por defecto
    let maxCoarseDist = -1;

    for (let i = 0; i < 8; i++) {
      const deg = (180 + i * 45) % 360;
      const rad = (deg * Math.PI) / 180;
      const dist = castHorizontalProbe(rad);
      coarseDistances.push(dist);

      if (dist > maxCoarseDist) {
        maxCoarseDist = dist;
        bestCoarseAngle = rad;
      }
    }

    const minCoarseDist = Math.min(...coarseDistances);
    const relativeDiff = maxCoarseDist > 0 ? (maxCoarseDist - minCoarseDist) / maxCoarseDist : 0;

    // C. Detección de Campo Abierto:
    // Ningún rayo golpeó nada O la variación entre todos los ángulos es <= 15% (y no está encerrado)
    const noHitsAtAll = minCoarseDist >= PROBE_MAX_DISTANCE - 0.05;
    const uniformOpenSpace = relativeDiff <= 0.15 && minCoarseDist > CORRIDOR_THRESHOLD_DIST;

    if (noHitsAtAll || uniformOpenSpace) {
      this.is360Patrol = true;
      this.baseForward.set(0, 0, -1); // Empieza apuntando hacia el interior de la arena (-Z)
      this.scanPhase = 0;
      return;
    }

    // D. Si hay obstáculos/paredes asimétricas -> Etapa 2: Ajuste fino (-15°, 0°, +15°)
    this.is360Patrol = false;
    const fineOffsetsDeg = [-15, 0, 15];
    let bestFineAngle = bestCoarseAngle;
    let maxFineDist = -1;

    for (const offsetDeg of fineOffsetsDeg) {
      const candidateRad = bestCoarseAngle + (offsetDeg * Math.PI) / 180;
      const dist = castHorizontalProbe(candidateRad);
      if (dist > maxFineDist) {
        maxFineDist = dist;
        bestFineAngle = candidateRad;
      }
    }

    this.baseForward.set(Math.sin(bestFineAngle), 0, Math.cos(bestFineAngle)).normalize();

    // Chequeo lateral (±90°) para pasillo vs. semi-abierto
    const leftDist = castHorizontalProbe(bestFineAngle - Math.PI * 0.5);
    const rightDist = castHorizontalProbe(bestFineAngle + Math.PI * 0.5);
    const isNarrowCorridor = leftDist < CORRIDOR_THRESHOLD_DIST || rightDist < CORRIDOR_THRESHOLD_DIST;

    const halfAngleDeg = isNarrowCorridor ? NARROW_SCAN_HALF_ANGLE_DEG : OPEN_SCAN_HALF_ANGLE_DEG;
    this.scanHalfAngleRad = (halfAngleDeg * Math.PI) / 180;
    this.scanPhase = 0;
  }

  /** Gira 360° continuos en campo abierto, u oscila en abanico si hay paredes/obstáculos */
  private updateScanningRotation(deltaTime: number): void {
    this.scanPhase += SCAN_SPEED_RAD_PER_SEC * deltaTime;

    const yawOffset = this.is360Patrol
      ? this.scanPhase // Rotación continua de 360°
      : Math.sin(this.scanPhase) * this.scanHalfAngleRad; // Oscilación acotada

    const pitchRad = (FIXED_VERTICAL_PITCH_DEG * Math.PI) / 180;

    const cosY = Math.cos(yawOffset);
    const sinY = Math.sin(yawOffset);
    const horizX = this.baseForward.x * cosY + this.baseForward.z * sinY;
    const horizZ = -this.baseForward.x * sinY + this.baseForward.z * cosY;

    const cosP = Math.cos(pitchRad);
    const sinP = Math.sin(pitchRad);
    this.currentLookDir.set(horizX * cosP, sinP, horizZ * cosP).normalize();

    this.applyOrientation(this.currentLookDir);
  }

  /** Apunta continuamente hacia la posición actual del torso del jugador antes de disparar */
  private aimAtTarget(playerPos: Vector3, _deltaTime: number): void {
    const torsoPosition = new Vector3(
      playerPos.x,
      playerPos.y + PLAYER_TORSO_OFFSET_Y,
      playerPos.z
    );

    const desiredDir = torsoPosition.subtract(this.root.position);
    if (desiredDir.lengthSquared() < 0.0001) return;

    // Actualizamos la dirección de mira al instante para que cada disparo vaya a su posición real
    this.currentLookDir.copyFrom(desiredDir).normalize();
    this.applyOrientation(this.currentLookDir, torsoPosition);
  }

  private applyOrientation(lookDir: Vector3, exactWorldTarget?: Vector3): void {
    // 1. Orientación horizontal del cuerpo del dron (root)
    const flatForward = new Vector3(lookDir.x, 0, lookDir.z);
    if (flatForward.lengthSquared() > 0.0001) {
      flatForward.normalize();
      if (!this.root.rotationQuaternion) {
        this.root.rotationQuaternion = Quaternion.Identity();
      }
      // El modelo visual tiene el frente en -Z
      Quaternion.FromLookDirectionLHToRef(
        flatForward.scale(-1),
        Vector3.UpReadOnly,
        this.root.rotationQuaternion
      );
    }

    // 2. Forzar actualización de matriz mundial del padre antes de orientar el cañón
    this.root.computeWorldMatrix(true);

    // 3. Orientar el cañón en Space.WORLD hacia el torso del jugador
    if (this.muzzle) {
      const aimTarget = exactWorldTarget ?? this.root.position.add(lookDir.scale(10));
      this.muzzle.lookAt(aimTarget, 0, 0, 0, Space.WORLD);
      this.muzzle.computeWorldMatrix(true);
    }
  }



  private canSeePlayer(playerPos: Vector3): boolean {
    const origin = this.root.position;

    // 1. Distancia (idéntico a DummyKamikazeDrone)
    if (Vector3.Distance(origin, playerPos) > DETECT_RADIUS) {
      return false;
    }

    // 2. Ángulo en plano horizontal XZ (idéntico a DummyKamikazeDrone)
    const forwardXZ = new Vector3(this.currentLookDir.x, 0, this.currentLookDir.z).normalize();
    const toTargetXZ = new Vector3(playerPos.x - origin.x, 0, playerPos.z - origin.z).normalize();

    const dot = Vector3.Dot(forwardXZ, toTargetXZ);
    const angleDegrees = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);

    if (angleDegrees > FOV_ANGLE_DEGREES / 2) {
      return false;
    }

    // 3. Chequeo de cobertura: lanzamos rayo al torso del jugador (playerPos.y + 0.35)
    // Si estás agachado detrás de una cobertura de 0.54m, el rayo pega en la caja y te oculta
    const scene = this.root.getScene();
    const targetAimPoint = new Vector3(playerPos.x, playerPos.y + 0.35, playerPos.z);
    const toTarget3D = targetAimPoint.subtract(origin);
    const dist3D = toTarget3D.length();

    if (dist3D < 0.1) return true;

    const ray = new Ray(origin, toTarget3D.scale(1 / dist3D), dist3D);
    const obstacleHit = scene.pickWithRay(ray, (mesh) => {
      if (this.ownsMesh(mesh)) return false;
      // Ignoramos al personaje/escudo; solo nos interesa si un bloque/pared tapa la vista
      const name = mesh.name.toLowerCase();
      if (name.includes("character") || name.includes("player") || name.includes("shield") || name.includes("board")) {
        return false;
      }
      return mesh.checkCollisions && mesh.isEnabled();
    });

    return !obstacleHit || !obstacleHit.hit;
  }

  // --- VISUALIZACIÓN TEMPORAL DEL CONO DE VISIÓN ---
  private initDebugCone(scene: Scene): void {
    if (!DISPLAY_DEBUG_CONE || !import.meta.env.DEV) return;
    const totalPoints = DEBUG_CONE_SEGMENTS + 2;
    for (let i = 0; i < totalPoints; i++) {
      this.debugConePoints.push(new Vector3());
    }
    this.debugConeMesh = MeshBuilder.CreateLines(
      `staticDroneCone_${this.id}`,
      { points: this.debugConePoints, updatable: true },
      scene
    );
    this.debugConeMesh.color = DEBUG_CONE_SCAN_COLOR;
    this.debugConeMesh.isPickable = false;
  }

  private updateDebugCone(): void {
    if (!this.debugConeMesh) return;
    if (!this.root.isEnabled()) {
      this.debugConeMesh.isVisible = false;
      return;
    }
    this.debugConeMesh.isVisible = true;
    const origin = this.root.position;
    this.debugConePoints[0].copyFrom(origin);
    const halfFovRad = (FOV_ANGLE_DEGREES * 0.5 * Math.PI) / 180;
    const up = Vector3.UpReadOnly;
    const right = Vector3.Cross(up, this.currentLookDir).normalize();
    for (let i = 0; i <= DEBUG_CONE_SEGMENTS; i++) {
      const ratio = i / DEBUG_CONE_SEGMENTS;
      const angle = -halfFovRad + ratio * (halfFovRad * 2);
      // Proyección del abanico siguiendo la dirección inclinada actual
      const rayDir = this.currentLookDir
        .scale(Math.cos(angle))
        .add(right.scale(Math.sin(angle)))
        .normalize();
      this.debugConePoints[i + 1].copyFrom(origin.add(rayDir.scale(DETECT_RADIUS)));
    }
    this.debugConePoints[this.debugConePoints.length - 1].copyFrom(origin);
    MeshBuilder.CreateLines(`staticDroneCone_${this.id}`, {
      points: this.debugConePoints,
      instance: this.debugConeMesh,
    });
  }

  protected override onDestroyed(): void {
    if (this.root && !this.root.isDisposed()) {
      ExplosionFX.spawn(this.root.position);
    }
    this.debugConeMesh?.dispose();
    this.debugConeMesh = null;
    super.onDestroyed();
  }

  protected override onDispose(): void {
    this.fsm.dispose();
    this.debugConeMesh?.dispose();
    this.debugConeMesh = null;
    super.onDispose();
  }
}