import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

const BODY_LENGTH = 0.35;
const BODY_DIAMETER = 0.045;
const TIP_LENGTH = 0.08;
const TIP_DIAMETER = 0.065;
const TESSELLATION = 16;
const MARKER_SIZE = 0.0001; // la raíz y el muzzle son marcadores de transform (invisibles)

export interface WeaponPrefab {
  readonly root: TransformNode;
  /** Punto desde el que salen los disparos (extremo del cañón). */
  readonly muzzle: TransformNode;
  dispose(): void;
}

/**
 * Crea un arma NUEVA en cada llamada, con `muzzle` ya resuelto (no hay que buscarlo por nombre).
 * Nace deshabilitada. Quien la crea es dueño y debe llamar a dispose().
 * Todas las piezas son no "pickeables": son parte del jugador y no deben recibir sus propios disparos.
 */
export function createWeaponPrefab(scene: Scene, prefix = ""): WeaponPrefab {
  const root = CreateBox(`${prefix}weaponRoot`, { size: MARKER_SIZE }, scene);
  root.isVisible = false;
  root.isPickable = false;

  const material = new StandardMaterial(`${prefix}weaponMat`, scene);
  material.diffuseColor = new Color3(0.2, 0.55, 0.85);

  const body = CreateCylinder(
    `${prefix}weaponBody`,
    { diameter: BODY_DIAMETER, height: BODY_LENGTH, tessellation: TESSELLATION },
    scene,
  );
  body.parent = root;
  body.rotation.x = Math.PI / 2;
  body.position.z = BODY_LENGTH / 2;
  body.isPickable = false;
  body.material = material;

  const tip = CreateCylinder(
    `${prefix}weaponTip`,
    { diameter: TIP_DIAMETER, height: TIP_LENGTH, tessellation: TESSELLATION },
    scene,
  );
  tip.parent = root;
  tip.rotation.x = Math.PI / 2;
  tip.position.z = BODY_LENGTH + TIP_LENGTH / 2;
  tip.isPickable = false;
  tip.material = material;

  const muzzle = CreateBox(`${prefix}weaponMuzzle`, { size: MARKER_SIZE }, scene);
  muzzle.isVisible = false;
  muzzle.isPickable = false; // marcador de transform: nunca debería ser blanco
  muzzle.parent = root;
  muzzle.position.z = BODY_LENGTH + TIP_LENGTH;

  root.setEnabled(false);

  return {
    root,
    muzzle,
    dispose: () => {
      root.dispose(false, false);
      material.dispose();
    },
  };
}
