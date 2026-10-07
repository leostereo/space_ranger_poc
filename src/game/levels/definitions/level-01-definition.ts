import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { LevelDefinition } from "../level-definition";

/**
 * Nivel 1 — mapa "Batalla del Pilar".
 * Los datos del mapa vienen del AssetManager del POC. Lo marcado TODO son placeholders:
 * hay que reemplazarlos por los valores reales del juego.
 */
export const level01Definition: LevelDefinition = {
  id: "level-01",
  order: 1,
  brief: "TODO: objetivo del nivel",
  maps: [{
    kind: "glb",
    modelRootUrl: "maps/",
    modelFile: "topoexport_3D_modeling_batallaDelPilar.glb",
    rootPosition: new Vector3(0, -900, -100),
    rootRotationXDeg: 90,
    groups: [
      { role: "buildings", name: "merged-buildings", match: { includes: "TPX_Buildings" }, allow32BitIndices: true },
      { role: "trees", name: "merged-trees", match: { pattern: /^node\d+/i }, allow32BitIndices: false },
      { role: "roads", name: "merged-roads", match: { includes: "TPX_RoadsOutlines" }, allow32BitIndices: true },
      { role: "greenAreas", name: "merged-green-areas", match: { includes: "TPX_GreenAreas" }, allow32BitIndices: true },
      { role: "waterways", name: "merged-waterways", match: { includes: "TPX_Waterways" }, allow32BitIndices: true },
    ],
    ground: { name: "ground", match: { includes: "TPX_Ground" } },
  }],
  spawns: {
    character: new Vector3(0, 0, 0), // TODO: coordenadas reales sobre el mapa
    enemies: [], // TODO
    items: [],
    other: [],
  },
  // Placeholder según la idea de hordas de 15 drones.
  waves: [{ wave: 1, enemyType: "drone", quantity: 15, delaySeconds: 0 }],
};
