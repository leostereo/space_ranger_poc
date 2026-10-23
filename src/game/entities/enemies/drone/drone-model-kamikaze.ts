import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreatePolyhedron } from "@babylonjs/core/Meshes/Builders/polyhedronBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { DroneMaterials, DroneModelV2 } from "./drone-modelV2";

// 🛠️ CALIBRACIÓN EXCLUSIVA DEL MODELO KAMIKAZE
// Buscamos un aspecto de "avispa/flecha" compacta y pequeña
const GLOBAL_SCALE = 1.2; // Mucho más pequeño que el Sentinel base (que usa 3.0)

const STAR_THICKNESS = 0.04;       
const STAR_LENGTH = 0.2;           // Alas más cortas y aerodinámicas
const STAR_BASE_WIDTH = 0.15;      

const PROP_DIAMETER = 0.25;        // Hélices chicas de alta revolución
const PROP_THICKNESS = 0.03;       

const COCKPIT_DIAMETER = 0.22;     
const COCKPIT_OFFSET_Y = -0.02;     

const DOME_DIAMETER = 0.12;        
const CANNON_DIAMETER = 0.02;
const CANNON_LENGTH = 0.18;        // Cañón corto (ya que no dispara proyectiles, es su percutor de impacto)
const CANNON_OFFSET_Y = -0.01; 
const CANNON_DEPTH_OFFSET = 0.01; 

/**
 * Constructor visual específico para el Drone Kamikaze.
 * Mantiene la firma compatible pero genera una geometría compacta y ágil.
 */
export function buildDroneModelKamikaze(
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
  visual.scaling.set(GLOBAL_SCALE, GLOBAL_SCALE, GLOBAL_SCALE); // 🌟 ESCALA DE AVISPA
  
  // 🟢 CORRECCIÓN DE FRENTE: Rotamos el mesh visual 180 grados (Math.PI) 
  // para alinear la punta del cañón con el eje +Z local que exige el controlador de movimiento.
  visual.rotation.y = Math.PI; 


  const meshes: Mesh[] = [];
  const propellers: Mesh[] = [];

  const attach = (mesh: Mesh, material: any, parent: TransformNode = visual): Mesh => {
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

  // --- CABINA SUPERIOR (Alerta Visual) ---
  const cockpit = CreateSphere(`enemy:${id}:cockpit`, { diameter: COCKPIT_DIAMETER, slice: 0.5, segments: 16 }, scene);
  cockpit.position.y = (STAR_THICKNESS / 2) + COCKPIT_OFFSET_Y;
  
  // OPCIONAL: Podríamos forzar un material rojo aquí, o confiar en el accentMaterial inyectado
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

  // --- SISTEMA DE IMPACTO INFERIOR ---
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
