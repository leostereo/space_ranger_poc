import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

const BODY_COLOR = Color3.FromHexString("#3a3f4b");
const BODY_EMISSIVE_COLOR = Color3.FromHexString("#0a0d14");
const ACCENT_COLOR = Color3.FromHexString("#ff8a1f"); // hélices, semiesfera y cañón
const ACCENT_EMISSIVE_COLOR = Color3.FromHexString("#5a2a05");
const SPECULAR_COLOR = new Color3(0.15, 0.15, 0.15);

/** Materiales del static drone. Son compartidos: los libera el AssetRegistry, no quien los usa. */
export function createStaticDroneBodyMaterial(scene: Scene): StandardMaterial {
  const material = new StandardMaterial("static-drone-body-material", scene);
  material.diffuseColor = BODY_COLOR;
  material.emissiveColor = BODY_EMISSIVE_COLOR;
  material.specularColor = SPECULAR_COLOR;
  return material;
}

export function createStaticDroneAccentMaterial(scene: Scene): StandardMaterial {
  const material = new StandardMaterial("static-drone-accent-material", scene);
  material.diffuseColor = ACCENT_COLOR;
  material.emissiveColor = ACCENT_EMISSIVE_COLOR;
  material.specularColor = SPECULAR_COLOR;
  return material;
}