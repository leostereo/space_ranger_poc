import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

const ACCENT_COLOR = Color3.FromHexString("#34d8ff"); // hélices, semiesfera y cañón
const ACCENT_EMISSIVE_COLOR = Color3.FromHexString("#0a4a5a");
const SPECULAR_COLOR = new Color3(0.15, 0.15, 0.15);

/** Material de acento del sentinel. Es compartido: lo libera el AssetRegistry, no quien lo usa. */
export function createSentinelDroneAccentMaterial(scene: Scene): StandardMaterial {
  const material = new StandardMaterial("sentinel-drone-accent-material", scene);
  material.diffuseColor = ACCENT_COLOR;
  material.emissiveColor = ACCENT_EMISSIVE_COLOR;
  material.specularColor = SPECULAR_COLOR;
  return material;
}