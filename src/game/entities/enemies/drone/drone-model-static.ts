import type { Material } from "@babylonjs/core/Materials/material";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import type { DroneMaterials, DroneModelV2 } from "./drone-modelV2";

// Dimensiones en metros reales (Perfil alto y estrecho: ~1.65m alto x ~0.76m ancho)
const BODY_HEIGHT = 1.05;
const BODY_DIAMETER = 0.44;

const TOP_DOME_DIAMETER = 0.40;
const BOTTOM_CONE_HEIGHT = 0.38;
const BOTTOM_CONE_TOP_DIAMETER = 0.36;

const ROTOR_RING_DIAMETER = 0.72;
const ROTOR_RING_THICKNESS = 0.045;

const FIN_WIDTH = 0.06;
const FIN_HEIGHT = 0.75;
const FIN_DEPTH = 0.28;
const FIN_OFFSET_X = 0.25;

const CANNON_HOUSING_DIAMETER = 0.22;
const CANNON_DIAMETER = 0.06;
const CANNON_LENGTH = 0.42;
const CANNON_OFFSET_Y = -0.15;

/**
 * Modelo compacto y vertical exclusivo para StaticDrone.
 * Maximiza la silueta vertical para facilitar la puntería en tercera persona.
 */
export function buildDroneModelStatic(
  scene: Scene,
  id: string,
  materials: DroneMaterials,
  position: Vector3,
  forward: Vector3,
  pitchToForward: boolean,
): DroneModelV2 {
  const root = new TransformNode(`enemy:${id}`, scene);
  root.position.copyFrom(position);

  const normalizedForward = forward.clone().normalize();
  root.rotation.y = Math.atan2(normalizedForward.x, normalizedForward.z);

  const visual = new TransformNode(`enemy:${id}:visual`, scene);
  visual.parent = root;

  const meshes: Mesh[] = [];
  const propellers: Mesh[] = [];

  const attach = (mesh: Mesh, material: Material, parent: TransformNode = visual): Mesh => {
    mesh.parent = parent;
    mesh.material = material;
    meshes.push(mesh);
    return mesh;
  };

  // --- 1. CHASIS VERTICAL PRINCIPAL (Columna octagonal) ---
  const core = CreateCylinder(
    `enemy:${id}:core`,
    { diameter: BODY_DIAMETER, height: BODY_HEIGHT, tessellation: 12 },
    scene,
  );
  attach(core, materials.body);

  // --- 2. SENSOR / CABINA SUPERIOR ---
  const cockpit = CreateSphere(
    `enemy:${id}:cockpit`,
    { diameter: TOP_DOME_DIAMETER, slice: 0.55, segments: 16 },
    scene,
  );
  cockpit.position.y = BODY_HEIGHT * 0.5 - 0.02;
  attach(cockpit, materials.accent);

  // --- 3. ESTABILIZADOR CÓNICO INFERIOR ---
  const lowerTail = CreateCylinder(
    `enemy:${id}:lowerTail`,
    {
      diameterTop: BOTTOM_CONE_TOP_DIAMETER,
      diameterBottom: 0.06,
      height: BOTTOM_CONE_HEIGHT,
      tessellation: 12,
    },
    scene,
  );
  lowerTail.position.y = -(BODY_HEIGHT * 0.5 + BOTTOM_CONE_HEIGHT * 0.5) + 0.02;
  attach(lowerTail, materials.body);

  // --- 4. ANILLOS DE ROTOR COAXIALES (Compactos alrededor del eje Y) ---
  const rotorHeights = [BODY_HEIGHT * 0.35, -BODY_HEIGHT * 0.32];
  rotorHeights.forEach((yPos, index) => {
    const ring = CreateTorus(
      `enemy:${id}:prop${index}`,
      { diameter: ROTOR_RING_DIAMETER, thickness: ROTOR_RING_THICKNESS, tessellation: 24 },
      scene,
    );
    ring.position.y = yPos;
    attach(ring, materials.accent);
    propellers.push(ring);
  });

  // --- 5. ALETAS LATERALES COMPACTAS (Aumentan hitbox vertical sin ensanchar mucho) ---
  [-FIN_OFFSET_X, FIN_OFFSET_X].forEach((xPos, index) => {
    const fin = CreateBox(
      `enemy:${id}:fin${index}`,
      { width: FIN_WIDTH, height: FIN_HEIGHT, depth: FIN_DEPTH },
      scene,
    );
    fin.position.set(xPos, 0, -0.04);
    attach(fin, materials.body);
  });

  // --- 6. SISTEMA DE ARMAS FRONTAL ---
  const cannonGroup = new TransformNode(`enemy:${id}:cannonGroup`, scene);
  cannonGroup.parent = visual;
  cannonGroup.position.set(0, CANNON_OFFSET_Y, BODY_DIAMETER * 0.45);

  const dome = CreateSphere(
    `enemy:${id}:dome`,
    { diameter: CANNON_HOUSING_DIAMETER, segments: 12 },
    scene,
  );
  attach(dome, materials.accent, cannonGroup);

  const cannonPivot = new TransformNode(`enemy:${id}:cannonPivot`, scene);
  cannonPivot.parent = cannonGroup;

  if (pitchToForward) {
    cannonPivot.rotation.x = -Math.asin(normalizedForward.y);
  }

  const cannon = CreateCylinder(
    `enemy:${id}:cannon`,
    { diameter: CANNON_DIAMETER, height: CANNON_LENGTH, tessellation: 12 },
    scene,
  );
  cannon.rotation.x = Math.PI / 2;
  cannon.position.z = CANNON_LENGTH * 0.5;
  attach(cannon, materials.accent, cannonPivot);

  const muzzle = new TransformNode(`enemy:${id}:muzzle`, scene);
  muzzle.parent = cannonPivot;
  muzzle.position.z = CANNON_LENGTH;

  return { root, visual, meshes, propellers, muzzle, cannonGroup, cannonPivot, cockpit };
}
