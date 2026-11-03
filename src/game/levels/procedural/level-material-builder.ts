import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { BoxPathMaterials } from "./box-path-builder"; // Ajustá el path relativo

// Constantes y colores idénticos a tu especificación original del Nivel 6
const SOLID_GLOW = 0.25;
const SOLID_SPECULAR = new Color3(0.1, 0.1, 0.1);

const BRIDGE_COLOR = Color3.FromHexString("#d9822b"); // Naranja
const BREAKABLE_COLOR = Color3.FromHexString("#c0392b"); // Rojo
const FALLING_COLOR = Color3.FromHexString("#f1c40f"); // Amarillo

/** Helper interno nativo para calcar el comportamiento del Nivel 6 */
const createSolidMaterial = (scene: Scene, name: string, color: Color3): StandardMaterial => {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.emissiveColor = color.scale(SOLID_GLOW);
  material.specularColor = SOLID_SPECULAR;
  return material;
};

/**
 * 🟢 Genera el set de materiales estrictos requeridos para construir puentes de tablones
 */
export function createBridgeMaterials(scene: Scene, prefixId: string): BoxPathMaterials {
  return {
    normal: createSolidMaterial(scene, `${prefixId}-box-material`, BRIDGE_COLOR),
    breakable: createSolidMaterial(scene, `${prefixId}-breakable-material`, BREAKABLE_COLOR),
    falling: createSolidMaterial(scene, `${prefixId}-falling-material`, FALLING_COLOR),
  };
}
