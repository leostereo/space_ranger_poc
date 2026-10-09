import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

const DUMMY_COLOR = Color3.FromHexString("#ff5a36");
const DUMMY_EMISSIVE_COLOR = Color3.FromHexString("#4a1a10");
const DUMMY_SPECULAR_COLOR = new Color3(0.1, 0.1, 0.1);

/** Material de los blancos de práctica. Es compartido: lo libera el AssetRegistry, no quien lo usa. */
export function createDummyTargetMaterial(scene: Scene): StandardMaterial {
  const material = new StandardMaterial("dummy-target-material", scene);
  material.diffuseColor = DUMMY_COLOR;
  material.emissiveColor = DUMMY_EMISSIVE_COLOR;
  material.specularColor = DUMMY_SPECULAR_COLOR;
  return material;
}