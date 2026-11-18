// materials/level-materials-factory.ts
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

const SOLID_COLOR = Color3.FromHexString("#1e3a8a");     // Azul marino profundo
const BREAKABLE_COLOR = Color3.FromHexString("#3b82f6"); // Azul acero brillante
const FLOOR_COLOR = Color3.FromHexString("#0f172a");     // Pizarra oscuro para contrastar coberturas
const SPECULAR_COLOR = new Color3(0.2, 0.2, 0.2);

/** Materiales compartidos de escenarios/obstáculos: los libera el AssetRegistry. */
export function createSolidObstacleMaterial(scene: Scene): StandardMaterial {
  const material = new StandardMaterial("solid-obstacle-material", scene);
  material.diffuseColor = SOLID_COLOR;
  material.emissiveColor = SOLID_COLOR.scale(0.25);
  material.specularColor = SPECULAR_COLOR;
  return material;
}

export function createBreakableObstacleMaterial(scene: Scene): StandardMaterial {
  const material = new StandardMaterial("breakable-obstacle-material", scene);
  material.diffuseColor = BREAKABLE_COLOR;
  material.emissiveColor = BREAKABLE_COLOR.scale(0.35);
  material.specularColor = SPECULAR_COLOR;
  return material;
}

export function createArenaFloorMaterial(scene: Scene): StandardMaterial {
  const material = new StandardMaterial("arena-floor-material", scene);
  material.diffuseColor = FLOOR_COLOR;
  material.specularColor = new Color3(0.05, 0.08, 0.15);
  return material;
}
