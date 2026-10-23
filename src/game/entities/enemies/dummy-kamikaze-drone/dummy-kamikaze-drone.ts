import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import type { EnemySpawn } from "../../../levels/level-definition";
import type { NavigationService } from "../../../navigation/navigation-service";
import type { PatrolRegion } from "../../../navigation/patrol-region";
import { createPatrolVolumeDebug, type PatrolVolumeDebug } from "../debug/patrol-volume-debug";
import { DroneBase } from "../drone/drone-base";
import type { EnemyDeps } from "../enemy-factory";
import { DummyKamikazeFsm } from "./dummy-kamikaze.fsm";
import { FlyingSentinelMovementController } from "./flying-sentinel-movement.controller";

// ==========================================
// CONSTANTES DE CALIBRACIÓN (FINE TUNING)
// ==========================================
const DETECT_RADIUS = 12.0;       // Distancia máxima de visión del cono
const FOV_ANGLE_DEGREES = 70.0;   // Apertura total del cono de visión en grados
const VISION_PLANE_Y = 1.0;       // Altura fija (Y) del plano de proyección (ej: el pecho del jugador)

const DEBUG_CONE_SEGMENTS = 16;   // Resolución de líneas para dibujar el arco visual de debug
const DEBUG_CONE_COLOR = new Color3(1, 0.3, 0); // Color naranja para la línea de visión de debug

/**
 * Enemy: DummyKamikazeDrone
 * Patrulla libremente en un volumen 3D y proyecta un cono de visión bidimensional
 * sobre un plano de altura fija (VISION_PLANE_Y).
 */
export class DummyKamikazeDrone extends DroneBase {
  private readonly navigation: NavigationService;
  private readonly region: PatrolRegion | undefined;
  private readonly movement: FlyingSentinelMovementController;
  private readonly fsm: DummyKamikazeFsm;
  
  private readonly destination = new Vector3();
  private readonly playerMesh: AbstractMesh;
  
  // Elementos de Debug Visual
  private volumeDebug: PatrolVolumeDebug | null = null;
  private debugConeMesh: LinesMesh | null = null;
  private readonly debugConePoints: Vector3[] = [];

  constructor(id: string, spawn: EnemySpawn, deps: EnemyDeps) {
    // Inicialización del padre desactivando su ProjectileWeapon original
    super(id, "dummyKamikazeDrone", spawn, deps, {
      accentMaterial: "sentinel-drone-accent",
      pitchToForward: true, // El drone inclinará el morro hacia su objetivo físico
      spawnAtExactPosition: true,
      armed: false,
    });

    this.navigation = deps.navigation;
    this.region = spawn.patrol;
    this.playerMesh = deps.playerMesh;

    // Inicialización del controlador de movimiento provisto por tu arquitectura
    this.movement = new FlyingSentinelMovementController(this.root, this.visual);

    // Activación del volumen de debug nativo del nivel
    if (this.region?.volume) {
      this.volumeDebug = createPatrolVolumeDebug(deps.scene, id, this.region.volume);
    }

    // Inicialización del debug interactivo para las líneas del cono sobre el plano
    this.initDebugCone(deps.scene);

    // Configuración estructural de la FSM
    this.fsm = new DummyKamikazeFsm({
      onEnterPatrol: () => this.pickDestination(),
      onEnterSpotting: () => this.movement.stop(),
      onEnterChasing: () => {},
      onEnterCharging: () => {},
      onEnterStunned: () => this.movement.stop(),
      onEnterReturning: () => {},
      onEnterExploding: () => this.destroy(),
    });
    
    this.fsm.start();
  }

  protected override onThink(deltaTime: number): void {
    // 1. Procesar el tick de la FSM para sincronizar tiempos de estados
    this.fsm.tick(deltaTime);

    // 2. Evaluar sensado y lógica del estado actual (Patrol)
    this.evaluateSensors();

    // 3. Renderizar y actualizar de manera dinámica la malla de debug del cono
    this.updateDebugCone();

    // 4. Integrar movimiento físico frame a frame
    this.movement.update(deltaTime);
  }

  /**
   * Ejecuta el sensado e intersección en el plano Y seleccionado.
   */
  private evaluateSensors(): void {
    if (this.fsm.state === "Patrol") {
      if (this.checkPlayerInPlaneCone()) {
        // Log de intercepción exitosa antes de transicionar
        if (import.meta.env.DEV) {
          console.log(`[DummyKamikazeDrone] Objetivo avistado en plano Y: ${VISION_PLANE_Y}`);
        }
        // Llegamos hasta aquí por diseño: Transicionamos estructuralmente a Spotting
        this.fsm.transitionTo("Spotting");
        return;
      }

      // Si terminó su trayectoria aleatoria dentro del volumen, busca un nuevo punto
      if (this.movement.isIdle) {
        this.pickDestination();
      }
    }
  }

  /**
   * Realiza los cálculos trigonométricos proyectando los vectores sobre el plano XZ.
   */
  private checkPlayerInPlaneCone(): boolean {
    const origin = this.root.position;
    const target = this.playerMesh.position;

    // Validación 1: Distancia absoluta en espacio tridimensional
    if (Vector3.Distance(origin, target) > DETECT_RADIUS) {
      return false;
    }

    // Proyectar dirección del drone e inclinación al objetivo sobre el plano horizontal
    const forwardXZ = new Vector3(this.root.forward.x, 0, this.root.forward.z).normalize();
    const toTargetXZ = new Vector3(target.x - origin.x, 0, target.z - origin.z).normalize();

    // Calcular el ángulo entre ambos vectores usando el producto punto
    const dot = Vector3.Dot(forwardXZ, toTargetXZ);
    const angleDegrees = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);

    // Si el ángulo es menor que la mitad de la apertura del FOV, está en rango angular
    return angleDegrees <= FOV_ANGLE_DEGREES / 2;
  }

  /**
   * Obtiene un destino tridimensional aleatorio provisto por el NavigationService.
   */
  private pickDestination(): void {
    const point = this.region ? this.navigation.getRandomPoint(this.region, this.destination) : null;
    if (point) {
      this.movement.moveTo(point);
    } else {
      this.movement.wait(1.0); // Espera reintento si no encuentra un punto libre
    }
  }

  /**
   * Construye inicialmente la malla paramétrica updatable del cono.
   */
  private initDebugCone(scene: any): void {
    // Inicializar el array de puntos necesarios (Origen + Arco + Cierre)
    const totalPoints = DEBUG_CONE_SEGMENTS + 2;
    for (let i = 0; i < totalPoints; i++) {
      this.debugConePoints.push(new Vector3());
    }

    // Instanciar la malla de líneas dinámica parametrizada como actualizable
    this.debugConeMesh = MeshBuilder.CreateLines("debugCone_" + this.id, {
      points: this.debugConePoints,
      updatable: true
    }, scene);

    this.debugConeMesh.color = DEBUG_CONE_COLOR;
    this.debugConeMesh.isPickable = false;
  }

  /**
   * Proyecta el cono visual actual del drone directamente sobre la altura fija
   * VISION_PLANE_Y, redibujando el arco en cada frame.
   */
  private updateDebugCone(): void {
    if (!this.debugConeMesh) return;

    // Punto 0: El origen del cono es la posición del drone proyectada en la altura del plano
    const centerOrigin = new Vector3(this.root.position.x, VISION_PLANE_Y, this.root.position.z);
    this.debugConePoints[0].copyFrom(centerOrigin);

    // Obtener la dirección base frontal en el plano horizontal
    const baseForward = new Vector3(this.root.forward.x, 0, this.root.forward.z).normalize();
    const halfFovRad = (FOV_ANGLE_DEGREES / 2) * (Math.PI / 180);

    // Calcular y poblar los puntos correspondientes al arco visual proyectado
    for (let i = 0; i <= DEBUG_CONE_SEGMENTS; i++) {
      const ratio = i / DEBUG_CONE_SEGMENTS;
      // Mapear ángulo de izquierda a derecha de la visión del dron
      const currentAngle = -halfFovRad + (ratio * (halfFovRad * 2));

      // Matriz de rotación manual simple sobre el plano horizontal para evitar sobrecostos
      const cos = Math.cos(currentAngle);
      const sin = Math.sin(currentAngle);
      const rotatedDir = new Vector3(
        baseForward.x * cos - baseForward.z * sin,
        0,
        baseForward.x * sin + baseForward.z * cos
      ).normalize();

      // Extender el punto en base al radio de visión configurado
      const arcPoint = centerOrigin.add(rotatedDir.scale(DETECT_RADIUS));
      this.debugConePoints[i + 1].copyFrom(arcPoint);
    }

    // Cerrar el loop de la geometría devolviendo la línea final de vuelta al origen
    this.debugConePoints[this.debugConePoints.length - 1].copyFrom(centerOrigin);

    // Forzar la actualización dinámica de la mallas sin re-instanciar memoria
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
