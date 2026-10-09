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
