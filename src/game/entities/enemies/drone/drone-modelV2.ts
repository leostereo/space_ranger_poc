import type { Material } from "@babylonjs/core/Materials/material";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreatePolyhedron } from "@babylonjs/core/Meshes/Builders/polyhedronBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

// 🛠️ CONTROL DE ESCALA GLOBAL DEL DRON
// 1.0 = Tamaño original. Modifica este multiplicador para agrandar o achicar todo el dron simétricamente.
const GLOBAL_SCALE = 3.0; 

export const DRONE_HOVER_HEIGHT = 0.7 * GLOBAL_SCALE; // Altura adaptada automáticamente a la escala
const STAR_THICKNESS = 0.05;       
const STAR_LENGTH = 0.3;          
const STAR_BASE_WIDTH = 0.27;      

const PROP_DIAMETER = 0.5;      
const PROP_THICKNESS = 0.06;       

const COCKPIT_DIAMETER = 0.4;     
const COCKPIT_OFFSET_Y = -0.05;     

const DOME_DIAMETER = 0.18;        
const CANNON_DIAMETER = 0.035;
const CANNON_LENGTH = 0.32;
const CANNON_OFFSET_Y = -0.02; 
const CANNON_DEPTH_OFFSET = 0.02; 

export interface DroneMaterials {
  readonly body: Material;
  readonly accent: Material;
}

export interface DroneModelV2 {
  readonly root: TransformNode;
  readonly visual: TransformNode;
  readonly meshes: Mesh[];
  readonly propellers: Mesh[];
  readonly muzzle: TransformNode;
  readonly cannonGroup: TransformNode;
  readonly cannonPivot: TransformNode;
  readonly cockpit: Mesh;
}

/**
 * Construye el dron V2 en forma de estrella de 4 puntas rotada en diagonal.
 * Escala de forma automática todo el conjunto visual mediante la constante `GLOBAL_SCALE`.
 */
export function buildDroneModelV2(
  scene: Scene,
  id: string,
  materials: DroneMaterials,
  position: Vector3,
  forward: Vector3,
  pitchToForward: boolean,
): DroneModelV2 {
  // Root actúa como el contenedor lógico (para físicas/IA). Mantiene escala 1:1 para evitar colisiones raras.
  const root = new TransformNode(`enemy:${id}`, scene);
  root.position.copyFrom(position);

  const normalizedForward = forward.clone().normalize();
  root.rotation.y = Math.atan2(normalizedForward.x, normalizedForward.z);

  // Visual aplica la transformación cosmética y escala de forma absoluta a todos sus hijos
  const visual = new TransformNode(`enemy:${id}:visual`, scene);
  visual.parent = root;
  visual.scaling.set(GLOBAL_SCALE, GLOBAL_SCALE, GLOBAL_SCALE); // 🌟 APLICACIÓN DE ESCALA GLOBAL

  const meshes: Mesh[] = [];
  const propellers: Mesh[] = [];

  const attach = (mesh: Mesh, material: Material, parent: TransformNode = visual): Mesh => {
    mesh.parent = parent;
    mesh.material = material;
    meshes.push(mesh);
    return mesh;
  };

  const CHASSIS_ROTATION_Y = Math.PI / 4;

  // --- CUERPO EN ESTRELLA ---
  const arm1 = CreatePolyhedron(`enemy:${id}:arm1`, { type: 1, size: 1 }, scene);
  arm1.scaling.set(STAR_LENGTH * 2, STAR_THICKNESS, STAR_BASE_WIDTH); 
  arm1.rotation.y = CHASSIS_ROTATION_Y; 
  attach(arm1, materials.body);

  const arm2 = CreatePolyhedron(`enemy:${id}:arm2`, { type: 1, size: 1 }, scene);
  arm2.scaling.set(STAR_BASE_WIDTH, STAR_THICKNESS, STAR_LENGTH * 2); 
  arm2.rotation.y = CHASSIS_ROTATION_Y; 
  attach(arm2, materials.body);

  const core = CreateCylinder(`enemy:${id}:core`, { diameter: STAR_BASE_WIDTH * 0.8, height: STAR_THICKNESS * 1.1, tessellation: 8 }, scene);
  core.rotation.y = CHASSIS_ROTATION_Y; 
  attach(core, materials.body);

  // --- CABINA SUPERIOR ---
  const cockpit = CreateSphere(`enemy:${id}:cockpit`, { diameter: COCKPIT_DIAMETER, slice: 0.5, segments: 16 }, scene);
  cockpit.position.y = (STAR_THICKNESS / 2) + COCKPIT_OFFSET_Y;
  attach(cockpit, materials.accent);

  // --- HÉLICES EN DIAGONAL ---
  const realTipDistance = STAR_LENGTH * 2.5; 
  const diagFactor = Math.sin(Math.PI / 4);
  const offsetDistance = realTipDistance * diagFactor;

  const propPositions = [
    new Vector3(offsetDistance, STAR_THICKNESS / 2, offsetDistance),   
    new Vector3(-offsetDistance, STAR_THICKNESS / 2, -offsetDistance), 
    new Vector3(-offsetDistance, STAR_THICKNESS / 2, offsetDistance),  
    new Vector3(offsetDistance, STAR_THICKNESS / 2, -offsetDistance),  
  ];

  propPositions.forEach((pos, index) => {
    const prop = CreateTorus(
      `enemy:${id}:prop${index}`,
      { diameter: PROP_DIAMETER, thickness: PROP_THICKNESS, tessellation: 24 },
      scene,
    );
    prop.position.copyFrom(pos); 
    attach(prop, materials.accent);
    propellers.push(prop);
  });

  // --- SISTEMA DE ARMAS INFERIOR ---
  const cannonGroup = new TransformNode(`enemy:${id}:cannonGroup`, scene);
  cannonGroup.parent = visual;
  cannonGroup.position.y = -STAR_THICKNESS / 2 + CANNON_OFFSET_Y;

  const dome = CreateSphere(`enemy:${id}:dome`, { diameter: DOME_DIAMETER, segments: 16 }, scene);
  dome.position.y = 0; 
  attach(dome, materials.accent, cannonGroup);

  const cannonPivot = new TransformNode(`enemy:${id}:cannonPivot`, scene);
  cannonPivot.parent = cannonGroup;
  cannonPivot.position.y = -(DOME_DIAMETER / 2) + CANNON_DEPTH_OFFSET;

  if (pitchToForward) {
    cannonPivot.rotation.x = -Math.asin(normalizedForward.y);
  }

  const cannon = CreateCylinder(
    `enemy:${id}:cannon`,
    { diameter: CANNON_DIAMETER, height: CANNON_LENGTH, tessellation: 12 },
    scene,
  );
  cannon.rotation.x = Math.PI / 2;
  cannon.position.z = CANNON_LENGTH / 2;
  attach(cannon, materials.accent, cannonPivot);

  const muzzle = new TransformNode(`enemy:${id}:muzzle`, scene);
  muzzle.parent = cannonPivot;
  muzzle.position.z = CANNON_LENGTH;

  return { root, visual, meshes, propellers, muzzle, cannonGroup, cannonPivot, cockpit };
}
