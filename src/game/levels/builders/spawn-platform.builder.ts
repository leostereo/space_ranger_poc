// src/game/levels/builders/spawn-platform.builder.ts
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { UnitBuilderFn } from "../unit-builder.types";

const FLAT_THICKNESS = 0.4;
const FLAT_WIDTH = 30;
const FLAT_COLOR = Color3.FromHexString("#5a6270"); // Mismo gris original

export const buildSpawnPlatform: UnitBuilderFn = (scene, unit, currentPosition, forwardDirection) => {
  const halfLengthVector = forwardDirection.scale(unit.length / 2);
  const centerPosition = currentPosition.add(halfLengthVector);

  // Construimos la malla física de la caja
  const mesh = CreateBox(unit.id + "-mesh", { width: FLAT_WIDTH, height: FLAT_THICKNESS, depth: unit.length }, scene);
  mesh.position.copyFrom(centerPosition.add(new Vector3(0, -FLAT_THICKNESS / 2, 0)));

  // 🟢 CORRECCIÓN: Asignamos el material de forma nativa en Babylon
  const material = new StandardMaterial(unit.id + "-material", scene);
  material.diffuseColor = FLAT_COLOR;
  material.emissiveColor = FLAT_COLOR.scale(0.25); // Brillo base idéntico al nivel 6
  material.specularColor = new Color3(0.1, 0.1, 0.1);
  mesh.material = material;

  return {
    centerPosition,
    meshes: [mesh],
    enemySpawns: [],
    nextPosition: currentPosition.add(forwardDirection.scale(unit.length))
  };
};
