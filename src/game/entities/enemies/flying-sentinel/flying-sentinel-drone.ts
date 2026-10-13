import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { EnemySpawn } from "../../../levels/level-definition";
import type { NavigationService } from "../../../navigation/navigation-service";
import type { PatrolRegion } from "../../../navigation/patrol-region";
import { createPatrolVolumeDebug, type PatrolVolumeDebug } from "../debug/patrol-volume-debug";
import { DroneBase } from "../drone/drone-base";
import type { EnemyDeps } from "../enemy-factory";
import { SentinelFsm } from "../sentinel/sentinel.fsm";
import { FlyingSentinelMovementController } from "./flying-sentinel-movement.controller";

const PATROL_RETRY_DELAY_SECONDS = 1; // si el servicio no devuelve un punto, reintenta más tarde

/**
 * Sentinel volador: patrulla puntos aleatorios dentro de un volumen 3D. Aparece en `spawn.position`
 * (que debe estar dentro del volumen). Por ahora solo vuela: no dispara. La FSM es la del sentinel,
 * con su único estado Patrol; los próximos estados se suman después.
 */
export class FlyingSentinelDrone extends DroneBase {
  private readonly navigation: NavigationService;
  private readonly region: PatrolRegion | undefined;
  private readonly movement: FlyingSentinelMovementController;
  private readonly fsm: SentinelFsm;
  private readonly destination = new Vector3();
  private volumeDebug: PatrolVolumeDebug | null = null;

  constructor(id: string, spawn: EnemySpawn, deps: EnemyDeps) {
    super(id, "flyingSentinel", spawn, deps, {
      accentMaterial: "sentinel-drone-accent",
      pitchToForward: false,
      spawnAtExactPosition: true,
      armed: false,
    });
    this.navigation = deps.navigation;
    this.region = spawn.patrol;
    if (!this.region?.volume) {
      console.warn(`[FlyingSentinelDrone] ${id} has no patrol volume in its spawn: it will not move`);
    } else {
      this.volumeDebug = createPatrolVolumeDebug(deps.scene, id, this.region.volume);
    }

    this.movement = new FlyingSentinelMovementController(this.root, this.visual);
    this.fsm = new SentinelFsm({
      onEnterPatrol: () => this.pickDestination(),
      hasFinishedTrip: () => this.movement.isIdle,
    });
    this.fsm.start();
  }

  protected override onThink(deltaTime: number): void {
    this.fsm.tick();
    this.movement.update(deltaTime);
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

  /** Estado Patrol: toma un punto 3D del servicio y va hacia él. */
  private pickDestination(): void {
    const point = this.region ? this.navigation.getRandomPoint(this.region, this.destination) : null;
    if (point) {
      this.movement.moveTo(point);
    } else {
      this.movement.wait(PATROL_RETRY_DELAY_SECONDS);
    }
  }

  private releaseDebug(): void {
    this.volumeDebug?.dispose();
    this.volumeDebug = null;
  }
}