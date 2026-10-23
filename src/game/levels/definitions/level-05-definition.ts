import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { PatrolVolume } from "../../navigation/patrol-region";
import type { EnemySpawn, LevelDefinition } from "../level-definition";
import { buildGround, buildLandingGround, LANDING_GROUND_SIZE } from "../procedural/ground-builders";

const GROUND_WIDTH = 10;
const GROUND_DEPTH = 60;

/** Pegado al extremo del ground (fuera de él, para no superponer mallas en el mismo plano). */
const LANDING_POSITION = new Vector3(0, 0, -(GROUND_DEPTH / 2 + LANDING_GROUND_SIZE / 2));
const SPAWN_HEIGHT_MARGIN = 0.5; // el personaje aparece apenas sobre la plataforma y cae

/** Volumen 3D de vuelo: de 1,5 a 6,5 m de altura. */
const FLIGHT_VOLUME: PatrolVolume = {
  kind: "box",
  center: new Vector3(0, 4, 14),
  size: new Vector3(80, 50, 56),
};

/** Un flyingSentinel que aparece en el centro del volumen y lo patrulla en 3D (sin plano). */
const flyingSentinel = (position: Vector3): EnemySpawn => ({
  position,
  forward: new Vector3(0, 0, -1),
  patrol: { volume: FLIGHT_VOLUME },
});

export const level05Definition: LevelDefinition = {
  id: "level-05",
  order: 5,
  brief: "Destroy the flying sentinel drone.",
  maps: [
    buildGround({ width: GROUND_WIDTH, depth: GROUND_DEPTH }), // primero: es el suelo principal
    buildLandingGround({ position: LANDING_POSITION }),
  ],
  spawns: {
    character: LANDING_POSITION.add(new Vector3(0, SPAWN_HEIGHT_MARGIN, 0)),
    enemies: {
      flyingSentinel: [
        flyingSentinel(FLIGHT_VOLUME.center.clone()),
        flyingSentinel(FLIGHT_VOLUME.center.clone()),
        
      ],
    },
    items: [],
    other: [],
  },
  waves: [],
};