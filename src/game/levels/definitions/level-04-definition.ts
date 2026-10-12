import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { DRONE_HOVER_HEIGHT } from "../../entities/enemies/drone/drone-model";
import type { PatrolPlane, PatrolVolume } from "../../navigation/patrol-region";
import type { EnemySpawn, LevelDefinition } from "../level-definition";
import { buildGround, buildLandingGround, LANDING_GROUND_SIZE } from "../procedural/ground-builders";

const GROUND_WIDTH = 10;
const GROUND_DEPTH = 60;

/** Pegado al extremo del ground (fuera de él, para no superponer mallas en el mismo plano). */
const LANDING_POSITION = new Vector3(0, 0, -(GROUND_DEPTH / 2 + LANDING_GROUND_SIZE / 2));
const SPAWN_HEIGHT_MARGIN = 0.5; // el personaje aparece apenas sobre la plataforma y cae

/** Plano horizontal a la altura de vuelo de los drones. */
const FLIGHT_PLANE: PatrolPlane = { point: new Vector3(0, DRONE_HOVER_HEIGHT, 0), normal: Vector3.Up() };

const NEAR_PATROL: PatrolVolume = {
  kind: "box",
  center: new Vector3(0, DRONE_HOVER_HEIGHT, 10),
  size: new Vector3(8, 2, 16),
};
const FAR_PATROL: PatrolVolume = { kind: "sphere", center: new Vector3(0, DRONE_HOVER_HEIGHT, 22), radius: 4.5 };

/** Un sentinel que parte de `position` mirando al landing y patrulla `volume` a la altura de vuelo. */
const sentinel = (position: Vector3, volume: PatrolVolume, fireDelaySeconds: number): EnemySpawn => ({
  position,
  forward: new Vector3(0, 0, -1),
  fireDelaySeconds,
  patrol: { volume, plane: FLIGHT_PLANE },
});

export const level04Definition: LevelDefinition = {
  id: "level-04",
  order: 4,
  brief: "Destroy the 2 sentinel drones.",
  maps: [
    buildGround({ width: GROUND_WIDTH, depth: GROUND_DEPTH }), // primero: es el suelo principal
    buildLandingGround({ position: LANDING_POSITION }),
  ],
  spawns: {
    character: LANDING_POSITION.add(new Vector3(0, SPAWN_HEIGHT_MARGIN, 0)),
    enemies: {
      sentinelDrone: [sentinel(new Vector3(0, 0, 10), NEAR_PATROL, 0), sentinel(new Vector3(0, 0, 22), FAR_PATROL, 1.5)],
    },
    items: [],
    other: [],
  },
  waves: [],
};