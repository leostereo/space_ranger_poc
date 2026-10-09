import type { Material } from "@babylonjs/core/Materials/material";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

/** Dimensiones del cuerpo del board (m). Placeholder hasta tener el modelo final. */
export const BOARD_DIMENSIONS = { width: 0.3, height: 0.1, depth: 1.2 } as const;

const SPHERE_SEGMENTS = 32; // superficie curva muy suave

// Cola: elipsoide pequeño en el extremo trasero (Z negativo), levantado e inclinado como un kicktail.
const TAIL_DIAMETER_X = BOARD_DIMENSIONS.depth / 4;
const TAIL_DIAMETER_Y = BOARD_DIMENSIONS.height / 2;
const TAIL_DIAMETER_Z = BOARD_DIMENSIONS.width;
const TAIL_HEIGHT_FACTOR = 0.3; // fracción del espesor del board que sube la cola
const TAIL_PITCH_RADIANS = (20 * Math.PI) / 180;

export interface BoardPrefab {
  /** Cuerpo del board; la cola es hija suya. */
  readonly mesh: Mesh;
  dispose(): void;
}

/**
 * Board placeholder: elipsoide con cola. Cada llamada crea sus meshes; el material es compartido
 * (viene del AssetRegistry), así que destruir el board no lo libera.
 */
export function createBoardPrefab(scene: Scene, material: Material, prefix = ""): BoardPrefab {
  const { width, height, depth } = BOARD_DIMENSIONS;

  // Ejes: X = ancho, Y = espesor (chato), Z = largo (define frente y atrás).
  const mesh = CreateSphere(
    `${prefix}board`,
    { diameterX: width, diameterY: height, diameterZ: depth, segments: SPHERE_SEGMENTS },
    scene,
  );
  mesh.material = material;

  const tail = CreateSphere(
    `${prefix}boardTail`,
    { diameterX: TAIL_DIAMETER_X, diameterY: TAIL_DIAMETER_Y, diameterZ: TAIL_DIAMETER_Z, segments: SPHERE_SEGMENTS },
    scene,
  );
  tail.material = material;
  tail.parent = mesh;
  tail.position.set(0, height * TAIL_HEIGHT_FACTOR, -(depth / 2));
  tail.rotation.set(TAIL_PITCH_RADIANS, 0, 0);

  return { mesh, dispose: () => mesh.dispose() }; // la cola se va con él (es hija)
}