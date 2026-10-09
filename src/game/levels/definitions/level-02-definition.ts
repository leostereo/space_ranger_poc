import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { LevelDefinition } from "../level-definition";
import { buildGround, buildLandingGround, LANDING_GROUND_SIZE } from "../procedural/ground-builders";
const GROUND_WIDTH = 10;
const GROUND_DEPTH = 60;

/** Pegado al extremo del ground (fuera de él, para no superponer mallas en el mismo plano). */
const LANDING_POSITION = new Vector3(0, 0, -(GROUND_DEPTH / 2 + LANDING_GROUND_SIZE / 2));
const SPAWN_HEIGHT_MARGIN = 0.5; // el personaje aparece apenas sobre la plataforma y cae

export const level02Definition: LevelDefinition = {
  id: "level-02",
  order: 2,
  brief: "TODO: objetivo del nivel 2",
  maps: [
    buildGround({ width: GROUND_WIDTH, depth: GROUND_DEPTH }),
    buildLandingGround({ position: LANDING_POSITION }),
  ],
  spawns: {
    character: LANDING_POSITION.add(new Vector3(0, SPAWN_HEIGHT_MARGIN, 0)),
    enemies: {
      dummyTarget: [new Vector3(0, 0, 0), new Vector3(-2, 0, 10), new Vector3(2, 0, 20)],
    },
    items: [],
    other: [],
  },
  waves: [{ wave: 1, enemyType: "drone", quantity: 15, delaySeconds: 0 }],
};