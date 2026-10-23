import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { NavigationService } from "../../../navigation/navigation-service";
import type { PatrolRegion } from "../../../navigation/patrol-region";
import type { EnemySpawn } from "../../../levels/level-definition";
import { DroneBase } from "../drone/drone-base";
import type { EnemyDeps } from "../enemy-factory";
import { SentinelFsm } from "./sentinel.fsm";
import { SentinelMovementController } from "./sentinel-movement.controller";

const PATROL_RETRY_DELAY_SECONDS = 1; // si el servicio no devuelve un punto, reintenta más tarde

/**
 * Dron centinela: patrulla puntos aleatorios que le da el servicio de navegación dentro de su región,
 * girando hacia cada uno antes de ir. Dispara cada 3 segundos hacia donde mira y se puede destruir.
 * Más adelante: flotación, yaw y pitch como efecto visual.
 */
export class SentinelDrone extends DroneBase {
  private readonly navigation: NavigationService;
  private readonly region: PatrolRegion | undefined;
  private readonly movement: SentinelMovementController;
  private readonly fsm: SentinelFsm;
  private readonly destination = new Vector3();

  constructor(id: string, spawn: EnemySpawn, deps: EnemyDeps) {
    super(id, "sentinelDrone", spawn, deps, { accentMaterial: "sentinel-drone-accent", pitchToForward: false });
    this.navigation = deps.navigation;
    this.region = spawn.patrol;
    if (!this.region) {
      console.warn(`[SentinelDrone] ${id} has no patrol region in its spawn: it will not move`);
    }

    this.movement = new SentinelMovementController(this.root);
    this.fsm = new SentinelFsm({
      onEnterPatrol: () => this.pickDestination(),
      hasFinishedTrip: () => this.movement.isIdle,
    });
    this.fsm.start();
  }

  protected override onThink(deltaTime: number, _playerPosition: Vector3): void {
    this.fsm.tick();
    this.movement.update(deltaTime);
  }

  protected override onDispose(): void {
    this.fsm.dispose();
    super.onDispose();
  }

  /** Estado Patrol: toma un punto del servicio y va hacia él. */
  private pickDestination(): void {
    const point = this.region ? this.navigation.getRandomPoint(this.region, this.destination) : null;
    if (point) {
      this.movement.moveTo(point);
    } else {
      this.movement.wait(PATROL_RETRY_DELAY_SECONDS);
    }
  }
}