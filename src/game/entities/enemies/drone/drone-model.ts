import type { Material } from "@babylonjs/core/Materials/material";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

/** Distancia fija entre la base (suelo) y el centro del cuerpo. */
export const DRONE_HOVER_HEIGHT = 0.7;

const BODY_WIDTH = 0.35; // 30% más angosto que la primera versión (0.5)
const BODY_HEIGHT = 0.15;
const BODY_DEPTH = 0.8; // el largo va sobre Z: el frente del dron es +Z local

// Cuatro hélices (torus acostados): dos a cada lado, pegadas al cuerpo.
const PROP_DIAMETER = 0.36; // 20% más grandes que la primera versión (0.3)
const PROP_THICKNESS = 0.04;
const PROP_TESSELLATION = 24;
const PROP_CENTER_X = BODY_WIDTH / 2 + PROP_DIAMETER / 2;
const PROP_CENTER_Z = BODY_DEPTH * 0.3;

// Semiesfera bajo el cuerpo, de la que sale el cañón.
const DOME_DIAMETER = 0.24;
const DOME_SEGMENTS = 16;
const DOME_HALF = 0.5; // slice de Babylon: la mitad de la altura
const CANNON_DIAMETER = 0.05;
const CANNON_LENGTH = 0.3;
const CANNON_TESSELLATION = 12;
const CANNON_PIVOT_Y = -BODY_HEIGHT / 2 - (DOME_DIAMETER / 2) * 0.5; // dentro de la semiesfera

export interface DroneMaterials {
  readonly body: Material;
  readonly accent: Material; // hélices, semiesfera y cañón
}

export interface DroneModel {
  /** Posición y yaw del dron: lo mueve el movimiento. */
  readonly root: TransformNode;
  /** Cuelga de root: reservado para efectos visuales (flotación, pitch, roll). */
  readonly visual: TransformNode;
  readonly meshes: Mesh[];
  /** Boca del cañón: su +Z es hacia donde sale el disparo. */
  readonly muzzle: TransformNode;
}

/**
 * Arma el dron: cuerpo rectangular, cuatro hélices (torus), semiesfera inferior y cañón.
 * `position` es el centro del cuerpo. El yaw sale del forward; con `pitchToForward` el cañón
 * también se inclina para apuntar exactamente al forward.
 */
export function buildDroneModel(
  scene: Scene,
  id: string,
  materials: DroneMaterials,
  position: Vector3,
  forward: Vector3,
  pitchToForward: boolean,
): DroneModel {
  const root = new TransformNode(`enemy:${id}`, scene);
  root.position.copyFrom(position);
  root.rotation.y = Math.atan2(forward.x, forward.z);

  const visual = new TransformNode(`enemy:${id}:visual`, scene);
  visual.parent = root;

  const meshes: Mesh[] = [];
  const attach = (mesh: Mesh, material: Material, parent: TransformNode = visual): Mesh => {
    mesh.parent = parent;
    mesh.material = material;
    meshes.push(mesh);
    return mesh;
  };

  attach(CreateBox(`enemy:${id}:body`, { width: BODY_WIDTH, height: BODY_HEIGHT, depth: BODY_DEPTH }, scene), materials.body);

  let propIndex = 0;
  for (const side of [-1, 1]) {
    for (const row of [-1, 1]) {
      const prop = CreateTorus(
        `enemy:${id}:prop${propIndex++}`,
        { diameter: PROP_DIAMETER, thickness: PROP_THICKNESS, tessellation: PROP_TESSELLATION },
        scene,
      );
      prop.position.set(side * PROP_CENTER_X, BODY_HEIGHT / 2, row * PROP_CENTER_Z);
      attach(prop, materials.accent);
    }
  }

  // Semiesfera con la parte curva hacia abajo.
  const dome = CreateSphere(`enemy:${id}:dome`, { diameter: DOME_DIAMETER, slice: DOME_HALF, segments: DOME_SEGMENTS }, scene);
  dome.rotation.x = Math.PI;
  dome.position.y = -BODY_HEIGHT / 2;
  attach(dome, materials.accent);

  // Cañón: un pivote (para inclinarlo) y un cilindro que sale hacia +Z.
  const cannonPivot = new TransformNode(`enemy:${id}:cannonPivot`, scene);
  cannonPivot.parent = visual;
  cannonPivot.position.y = CANNON_PIVOT_Y;
  if (pitchToForward) {
    cannonPivot.rotation.x = -Math.asin(Math.max(-1, Math.min(1, forward.y)));
  }

  const cannon = CreateCylinder(
    `enemy:${id}:cannon`,
    { diameter: CANNON_DIAMETER, height: CANNON_LENGTH, tessellation: CANNON_TESSELLATION },
    scene,
  );
  cannon.rotation.x = Math.PI / 2;
  cannon.position.z = CANNON_LENGTH / 2;
  attach(cannon, materials.accent, cannonPivot);

  const muzzle = new TransformNode(`enemy:${id}:muzzle`, scene);
  muzzle.parent = cannonPivot;
  muzzle.position.z = CANNON_LENGTH;

  return { root, visual, meshes, muzzle };
}