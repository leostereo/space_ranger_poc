import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { PatrolVolume } from "../../navigation/patrol-region";
import type { EnemySpawn, LevelDefinition } from "../level-definition";
import { buildGround, buildLandingGround, LANDING_GROUND_SIZE } from "../procedural/ground-builders";

const GROUND_WIDTH = 10;
const GROUND_DEPTH = 60;

/** Pegado al extremo del ground (fuera de él, para no superponer mallas en el mismo plano). */
const LANDING_POSITION = new Vector3(0, 0, -(GROUND_DEPTH / 2 + LANDING_GROUND_SIZE / 2));
const SPAWN_HEIGHT_MARGIN = 0.5; // el personaje aparece apenas sobre la plataforma y cae

/** 
 * Volumen 3D de vuelo idéntico al nivel 5: de 1,5 a 6,5 m de altura.
 * Ideal para que el drone patrulle arriba del suelo principal y su cono intersecte al jugador.
 */
const FLIGHT_VOLUME: PatrolVolume = {
  kind: "box",
  center: new Vector3(0, 4.5, 10), // Un poco más alto del suelo
  size: new Vector3(12, 6, 40),    // 🟢 VOLUMEN EXPANDIDO (Ancho: 12, Alto: 6, Largo: 40)
};

/** Un dummyKamikazeDrone que aparece en el centro de su volumen y lo patrulla en 3D. */
const dummyKamikaze = (position: Vector3): EnemySpawn => ({
  position,
  forward: new Vector3(0, 0, -1), // Mira inicialmente hacia la zona del jugador
  patrol: { volume: FLIGHT_VOLUME },
});

export const level07Definition: LevelDefinition = {
  id: "level-07",
  order: 7,
  brief: "Prueba de IA: Evitá el cono naranja del Dummy Kamikaze Drone.",
  maps: [
    buildGround({ width: GROUND_WIDTH, depth: GROUND_DEPTH }), // Suelo principal de pruebas
    buildLandingGround({ position: LANDING_POSITION }),         // Plataforma de inicio del jugador
  ],
  spawns: {
    character: LANDING_POSITION.add(new Vector3(0, SPAWN_HEIGHT_MARGIN, 0)),
    enemies: {
      // Invocamos el nuevo identificador de enemigo que registramos en la factoría
     dummyKamikazeDrone: [
        dummyKamikaze(FLIGHT_VOLUME.center.clone()), // Primer dron (centro del volumen)
        dummyKamikaze(FLIGHT_VOLUME.center.add(new Vector3(3, 0, 4))), // Segundo dron desplazado un poco en X y Z
        dummyKamikaze(FLIGHT_VOLUME.center.add(new Vector3(-3, 0, 4))), // Segundo dron desplazado un poco en X y Z
        dummyKamikaze(FLIGHT_VOLUME.center.add(new Vector3(-3, 0, -4))), // Segundo dron desplazado un poco en X y Z
      ],
    },
    items: [],
    other: [],
  },
  waves: [],
};
