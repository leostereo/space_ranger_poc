import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

const BOARD_COLOR = Color3.FromHexString("#00e5ff");
const BOARD_EMISSIVE_COLOR = Color3.FromHexString("#0a4a52");
const BOARD_SPECULAR_COLOR = new Color3(0.2, 0.2, 0.2);

/** Material sci-fi con brillo propio. Es compartido: lo libera el AssetRegistry, no quien lo usa. */
export function createBoardMaterial(scene: Scene): StandardMaterial {
  const material = new StandardMaterial("board-material", scene);
  material.diffuseColor = BOARD_COLOR;
  material.emissiveColor = BOARD_EMISSIVE_COLOR;
  material.specularColor = BOARD_SPECULAR_COLOR;
  return material;
}