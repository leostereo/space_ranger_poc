import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { EnemySpawn, LevelDefinition } from "../level-definition";
import { buildGround, buildLandingGround, LANDING_GROUND_SIZE } from "../procedural/ground-builders";

const GROUND_WIDTH = 10;
const GROUND_DEPTH = 60;

/** Pegado al extremo del ground (fuera de él, para no superponer mallas en el mismo plano). */
const LANDING_POSITION = new Vector3(0, 0, -(GROUND_DEPTH / 2 + LANDING_GROUND_SIZE / 2));
const SPAWN_HEIGHT_MARGIN = 0.5; // el personaje aparece apenas sobre la plataforma y cae

/** Un dron en `position` que mira en horizontal hacia el landing. */
const aimAtLanding = (position: Vector3): EnemySpawn => ({
  position,
  forward: new Vector3(LANDING_POSITION.x - position.x, 0, LANDING_POSITION.z - position.z).normalize(),
});

export const level03Definition: LevelDefinition = {
  id: "level-03",
  order: 3,
  brief: "Test level: let the static drones shoot you down.",
  maps: [
    buildGround({ width: GROUND_WIDTH, depth: GROUND_DEPTH }), // primero: es el suelo principal
    buildLandingGround({ position: LANDING_POSITION }),
  ],
  spawns: {
    character: LANDING_POSITION.add(new Vector3(0, SPAWN_HEIGHT_MARGIN, 0)),
    enemies: {
      staticDrone: [
        aimAtLanding(new Vector3(0, 0, 8)),
        aimAtLanding(new Vector3(-3, 0, 14)),
        aimAtLanding(new Vector3(3, 0, 14)),
      ],
    },
    items: [],
    other: [],
  },
  waves: [],
};