import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";

import type { EnemySpawn } from "../../../levels/level-definition";
import type { NavigationService } from "../../../navigation/navigation-service";
import type { PatrolRegion } from "../../../navigation/patrol-region";
import { createPatrolVolumeDebug, type PatrolVolumeDebug } from "../debug/patrol-volume-debug";
import { DroneBase } from "../drone/drone-base";
import type { EnemyDeps } from "../enemy-factory";
import { DummyKamikazeFsm } from "./dummy-kamikaze.fsm";
import { buildDroneModelKamikaze } from "../drone/drone-model-kamikaze";
import { DummyKamikazeMovementController } from "./dummy-kamikaze-movement.controller";

// ==========================================================
// PARAMETRIZACIÓN MECÁNICA DE CALIBRACIÓN (FINE TUNING)
// ==========================================================
const DETECT_RADIUS = 20.0;       // 🟢 Aumentamos el rango de visión para el mapa grande
const FOV_ANGLE_DEGREES = 80.0;   // 🟢 Cono un poco más abierto
const VISION_PLANE_Y = 1.0;         // Altura fija (Y) sobre la que intersecta la visión del dron
const DEBUG_CONE_SEGMENTS = 16;     // Definición de las líneas de debug del cono
const DEBUG_CONE_COLOR = new Color3(1, 0.4, 0); // Color del cono de debug (Naranja)

export class DummyKamikazeDrone extends DroneBase {
  private readonly navigation: NavigationService;
  private readonly region: PatrolRegion | undefined;
  private readonly movement: DummyKamikazeMovementController;
  private readonly fsm: DummyKamikazeFsm;
  
  private readonly destination = new Vector3();
  
  // Elementos Cosméticos y Estructurales de Debug
  private volumeDebug: PatrolVolumeDebug | null = null;
  private debugConeMesh: LinesMesh | null = null;
  private readonly debugConePoints: Vector3[] = [];

  constructor(id: string, spawn: EnemySpawn, deps: EnemyDeps) {
    super(id, "dummyKamikazeDrone", spawn, deps, {
      accentMaterial: "sentinel-drone-accent", // Podés cambiarlo si tenés un key de asset rojo/alarma
      pitchToForward: true, 
      spawnAtExactPosition: true,
      armed: false,
      customModelBuilder: buildDroneModelKamikaze // 🟢 INYECCIÓN POLIMÓRFICA DE SU PROPIO SHAPE
    });

    this.navigation = deps.navigation;
    this.region = spawn.patrol;

    this.movement = new DummyKamikazeMovementController(this.root, this.visual);

    if (this.region?.volume) {
      this.volumeDebug = createPatrolVolumeDebug(deps.scene, id, this.region.volume);
    }

    this.initDebugCone(deps.scene);

    this.fsm = new DummyKamikazeFsm({
      onEnterPatrol: () => this.pickPatrolDestination(),
      onEnterSpotting: () => this.movement.stop(),
      onEnterChasing: () => {},
      onEnterCharging: () => {},
      onEnterStunned: () => this.movement.stop(),
      onEnterReturning: () => {},
      onEnterExploding: () => this.destroy(),
    });
    
    this.fsm.start();
  }

  /**
   * Hook principal del Drone. Inyecta directamente la posición fresquísima 
   * del jugador provista por el push-data de LevelStrategy.
   */
  protected override onThink(deltaTime: number, playerPosition: Vector3): void {
  // 1. Sincronizar el timer interno de la FSM
    this.fsm.tick(deltaTime);

    // 2. Procesar el sensado geométrico con los datos del frame activo
    this.evaluateSensors(playerPosition);

    // 3. Reproyectar el cono de debug naranja interactivo sobre VISION_PLANE_Y
    this.updateDebugCone();

    // 4. Actualizar el desplazamiento físico del nodo
    this.movement.update(deltaTime);
  }

  private evaluateSensors(playerPos: Vector3): void {
    if (this.fsm.state === "Patrol") {
      // Pasamos directamente la coordenada tridimensional inyectada
      if (this.checkPlayerInPlaneCone(playerPos)) {
        if (import.meta.env.DEV) {
          console.log(`[DummyKamikazeDrone] Detección confirmada en plano horizontal.`);
        }
        this.fsm.transitionTo("Spotting");
        return;
      }

      // Si terminó su recorrido de patrulla aleatoria, busca un nuevo waypoint
      if (this.movement.isIdle) {
        this.pickPatrolDestination();
      }
    }
  }

  private checkPlayerInPlaneCone(playerPos: Vector3): boolean {
    const origin = this.root.position;

    // Distancia tridimensional lineal euclidiana simplificada
    if (Vector3.Distance(origin, playerPos) > DETECT_RADIUS) {
      return false;
    }

    // Proyecciones bidimensionales (aplanado en XZ) para aislar saltos o desniveles
    // .scale(-1) invierte el vector frontal nativo de Babylon para que mire hacia el cañón corregido
    const forwardXZ = new Vector3(this.root.forward.x, 0, this.root.forward.z).normalize().scale(-1);

    const toTargetXZ = new Vector3(playerPos.x - origin.x, 0, playerPos.z - origin.z).normalize();

    const dot = Vector3.Dot(forwardXZ, toTargetXZ);
    const angleDegrees = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);

    // Si el desfase angular está dentro de la mitad de apertura del FOV, fue interceptado
    return angleDegrees <= FOV_ANGLE_DEGREES / 2;
  }

  private pickPatrolDestination(): void {
    const point = this.region ? this.navigation.getRandomPoint(this.region, this.destination) : null;
    if (point) {
      this.movement.moveTo(point);
    } else {
      this.movement.wait(1.0); // Margen de espera en caso de fallo de Navmesh
    }
  }

  private initDebugCone(scene: any): void {
    const totalPoints = DEBUG_CONE_SEGMENTS + 2;
    for (let i = 0; i < totalPoints; i++) {
      this.debugConePoints.push(new Vector3());
    }

    this.debugConeMesh = MeshBuilder.CreateLines("debugCone_" + this.id, {
      points: this.debugConePoints,
      updatable: true
    }, scene);

    this.debugConeMesh.color = DEBUG_CONE_COLOR;
    this.debugConeMesh.isPickable = false; // Evita interrumpir raycasts balísticos o del juego
  }

  private updateDebugCone(): void {
    if (!this.debugConeMesh) return;

    // El nodo inicial del cono nace de las coordenadas (X,Z) del dron fijadas a la altura del plano
    const centerOrigin = new Vector3(this.root.position.x, VISION_PLANE_Y, this.root.position.z);
    this.debugConePoints[0].copyFrom(centerOrigin);

    const baseForward = new Vector3(this.root.forward.x, 0, this.root.forward.z).normalize().scale(-1);
    const halfFovRad = (FOV_ANGLE_DEGREES / 2) * (Math.PI / 180);

    // Reconstrucción procedural de los vértices del arco visual proyectado
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

      const arcPoint = centerOrigin.add(rotatedDir.scale(DETECT_RADIUS));
      this.debugConePoints[i + 1].copyFrom(arcPoint);
    }

    // Cerramos el bucle geométrico conectando el último punto de regreso al centro
    this.debugConePoints[this.debugConePoints.length - 1].copyFrom(centerOrigin);

    // Actualiza la instancia de líneas optimizando el dibujado sin instanciar mallas duplicadas
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
    this.releaseDebug();
    super.onDestroyed();
  }

  protected override onDispose(): void {
    this.fsm.dispose();
    this.releaseDebug();
    super.onDispose();
  }
}
