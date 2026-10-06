#!/usr/bin/env bash
# setup.script-006 — Factories de assets creados por código: escudo, propulsores, arma y tabla.
# Ejecutar parado en /src:   bash game/setup/setup.script-006.sh
#
# Qué hace (solo crea archivos nuevos; no modifica ninguno existente):
#   game/assets/factories/{shield,thruster,weapon,board}-factory.ts
#
# Cada factory expone createXxxPrefab(scene, prefix = ""): devuelve un prefab NUEVO en cada
# llamada (no hay prototipo que clonar), con las referencias ya resueltas (muzzle, nozzles...),
# nacido deshabilitado y con dispose(). Las dimensiones/colores son constantes locales de cada archivo.
set -euo pipefail

if [[ "$(basename "$PWD")" != "src" ]]; then
  echo "Error: ejecutá este script parado en la carpeta src (actual: $PWD)" >&2
  exit 1
fi

BOOT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ ! -f "$BOOT_DIR/_lib.sh" ]]; then
  echo "Error: falta $BOOT_DIR/_lib.sh (lo crea setup.script-001.sh)" >&2
  exit 1
fi
# shellcheck source=_lib.sh
source "$BOOT_DIR/_lib.sh"

setup_begin "$0"
setup_requires "setup.script-005.sh"

echo "-- archivos nuevos"

write_file "game/assets/factories/shield-factory.ts" <<'EOF'
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
EOF

write_file "game/assets/factories/thruster-factory.ts" <<'EOF'
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

const BODY_LENGTH = 0.12;
const BODY_DIAMETER = 0.06;
const CONE_LENGTH = 0.05;
const CONE_BASE_DIAMETER = 0.09; // base ancha pegada al cuerpo; el vértice apunta hacia afuera (salida del chorro)
const TESSELLATION = 16;
const SIDE_OFFSET_X = 0.08; // separación lateral de cada propulsor respecto del centro del grupo
const MARKER_SIZE = 0.0001; // las cajas "raíz" son solo marcadores de transform (invisibles)

export interface ThrusterPrefab {
  readonly group: TransformNode;
  readonly left: Mesh;
  readonly right: Mesh;
  /** Punta del cono izquierdo: de acá sale el chorro. */
  readonly leftNozzle: TransformNode;
  readonly rightNozzle: TransformNode;
  dispose(): void;
}

/**
 * Crea un par de propulsores NUEVO en cada llamada. Nace deshabilitado.
 * Quien lo crea es dueño y debe llamar a dispose().
 */
export function createThrusterPrefab(scene: Scene, prefix = ""): ThrusterPrefab {
  const group = new TransformNode(`${prefix}thrusterGroup`, scene);

  const material = new StandardMaterial(`${prefix}thrusterMat`, scene);
  material.diffuseColor = new Color3(0.25, 0.25, 0.3);
  material.specularColor = new Color3(0.1, 0.1, 0.1);

  const buildOne = (name: string): { root: Mesh; nozzle: TransformNode } => {
    const root = CreateBox(`${prefix}${name}Root`, { size: MARKER_SIZE }, scene);
    root.isVisible = false;
    root.isPickable = false;
    root.parent = group;

    const body = CreateCylinder(
      `${prefix}${name}Body`,
      { diameter: BODY_DIAMETER, height: BODY_LENGTH, tessellation: TESSELLATION },
      scene,
    );
    body.parent = root;
    body.rotation.x = Math.PI / 2;
    body.position.z = BODY_LENGTH / 2;
    body.isPickable = false;
    body.material = material;

    // Cono (diameterTop = 0): base ancha pegada al cuerpo, vértice hacia afuera.
    const cone = CreateCylinder(
      `${prefix}${name}Cone`,
      { diameterTop: 0, diameterBottom: CONE_BASE_DIAMETER, height: CONE_LENGTH, tessellation: TESSELLATION },
      scene,
    );
    cone.parent = root;
    cone.rotation.x = -Math.PI / 2;
    cone.position.z = BODY_LENGTH + CONE_LENGTH / 2;
    cone.isPickable = false;
    cone.material = material;

    const nozzle = new TransformNode(`${prefix}${name}Nozzle`, scene);
    nozzle.parent = root;
    nozzle.position.set(0, 0, BODY_LENGTH + CONE_LENGTH); // punta del cono

    return { root, nozzle };
  };

  const left = buildOne("thrusterLeft");
  const right = buildOne("thrusterRight");
  left.root.position.set(-SIDE_OFFSET_X, 0, 0);
  right.root.position.set(SIDE_OFFSET_X, 0, 0);

  group.setEnabled(false);

  return {
    group,
    left: left.root,
    right: right.root,
    leftNozzle: left.nozzle,
    rightNozzle: right.nozzle,
    dispose: () => {
      group.dispose(false, false);
      material.dispose();
    },
  };
}
EOF

write_file "game/assets/factories/weapon-factory.ts" <<'EOF'
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
EOF

write_file "game/assets/factories/board-factory.ts" <<'EOF'
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Tools } from "@babylonjs/core/Misc/tools";
import type { Scene } from "@babylonjs/core/scene";

// Dimensiones PLACEHOLDER de la tabla (a reemplazar por el modelo final).
// Si un controller de física necesita estas medidas, pasan a gameConfig.
const BOARD_WIDTH = 0.3;
const BOARD_HEIGHT = 0.1;
const BOARD_DEPTH = 1.2;
const BOARD_COLOR = "#00e5ff";
const BOARD_EMISSIVE_COLOR = "#0a4a52";
const SPHERE_SEGMENTS = 32;

// Cola: óvalo cruzado, elevado y inclinado hacia arriba (look de kicktail).
const TAIL_DEPTH_FACTOR = 1 / 4; // largo de la cola respecto del largo de la tabla
const TAIL_HEIGHT_FACTOR = 0.5; // espesor de la cola respecto del espesor de la tabla
const TAIL_LIFT_FACTOR = 0.3; // cuánto se eleva la cola (en múltiplos del espesor de la tabla)
const TAIL_TILT_DEG = 20;

export interface BoardPrefab {
  readonly root: Mesh;
  readonly tail: Mesh;
  dispose(): void;
}

/**
 * Crea una tabla NUEVA en cada llamada: un óvalo (esfera deformada) más la cola como hijo.
 * Nace deshabilitada y en el origen: el nivel o el personaje decide posición y habilitación.
 * Quien la crea es dueño y debe llamar a dispose().
 */
export function createBoardPrefab(scene: Scene, prefix = ""): BoardPrefab {
  const material = new StandardMaterial(`${prefix}boardMat`, scene);
  material.diffuseColor = Color3.FromHexString(BOARD_COLOR);
  material.emissiveColor = Color3.FromHexString(BOARD_EMISSIVE_COLOR);
  material.specularColor = new Color3(0.2, 0.2, 0.2);

  // Ejes: X = ancho, Y = espesor, Z = largo (define frente y atrás).
  const root = CreateSphere(
    `${prefix}board`,
    { diameterX: BOARD_WIDTH, diameterY: BOARD_HEIGHT, diameterZ: BOARD_DEPTH, segments: SPHERE_SEGMENTS },
    scene,
  );
  root.material = material;

  const tail = CreateSphere(
    `${prefix}boardTail`,
    {
      diameterX: BOARD_DEPTH * TAIL_DEPTH_FACTOR,
      diameterY: BOARD_HEIGHT * TAIL_HEIGHT_FACTOR,
      diameterZ: BOARD_WIDTH,
      segments: SPHERE_SEGMENTS,
    },
    scene,
  );
  tail.material = material;
  tail.parent = root; // emparentada al cuerpo para que la física/transform sea una sola
  tail.position.set(0, BOARD_HEIGHT * TAIL_LIFT_FACTOR, -(BOARD_DEPTH / 2));
  tail.rotation.set(Tools.ToRadians(TAIL_TILT_DEG), 0, 0);

  root.setEnabled(false);

  return {
    root,
    tail,
    dispose: () => {
      root.dispose(false, false);
      material.dispose();
    },
  };
}
EOF

setup_end