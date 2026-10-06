import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

const SHIELD_WIDTH = 0.45; // antes 0.56 (0.7 original)
const SHIELD_HEIGHT = 0.58; // antes 0.72 (0.9 original)
const SHIELD_THICKNESS = 0.05; // antes 0.06
const SHIELD_RADIUS = SHIELD_WIDTH / 2; // el ancho lo define el radio de la cápsula
const SHIELD_ALPHA = 0.45;
const CAPSULE_TESSELLATION = 24;
const CAPSULE_CAP_SUBDIVISIONS = 6;

export interface ShieldPrefab {
  readonly root: TransformNode;
  dispose(): void;
}

/**
 * Crea un escudo NUEVO en cada llamada (no hay prototipo que clonar). Nace deshabilitado:
 * quien lo usa decide cuándo habilitarlo. Quien lo crea es dueño y debe llamar a dispose().
 */
export function createShieldPrefab(scene: Scene, prefix = ""): ShieldPrefab {
  const root = new TransformNode(`${prefix}shieldRoot`, scene);

  // Cápsula vertical (eje Y); `height` es el alto TOTAL incluyendo las dos tapas.
  const panel = CreateCapsule(
    `${prefix}shieldPanel`,
    { height: SHIELD_HEIGHT, radius: SHIELD_RADIUS, tessellation: CAPSULE_TESSELLATION, capSubdivisions: CAPSULE_CAP_SUBDIVISIONS },
    scene,
  );
  panel.parent = root;
  panel.scaling.z = SHIELD_THICKNESS / SHIELD_WIDTH; // aplasta en Z: el diámetro en Z queda = grosor
  panel.isPickable = false;

  const material = new StandardMaterial(`${prefix}shieldMat`, scene);
  material.diffuseColor = new Color3(0.2, 0.55, 0.85);
  material.emissiveColor = new Color3(0.1, 0.35, 0.6);
  material.specularColor = new Color3(0.1, 0.1, 0.1);
  material.alpha = SHIELD_ALPHA;
  panel.material = material;

  root.setEnabled(false);

  return {
    root,
    dispose: () => {
      root.dispose(false, false);
      material.dispose();
    },
  };
}
