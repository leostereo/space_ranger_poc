import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { UnitBuilderFn } from "../unit-builder.types";
import { createTrackMesh } from "../procedural/track-builder"; // 🟢 Importamos tu track-builder original

// Medidas y proporciones exactas clonadas de tu archivo de Nivel 6
const TUBE_WIDTH_SCALE = 1.5;
const TUBE_RADIUS = 8 * TUBE_WIDTH_SCALE;
const TUBE_AXIS_OFFSET_Y = 4.8 * TUBE_WIDTH_SCALE;
const TUBE_TESSELLATION = 20;

const TRACK_WALL_OVERLAP = 0.15;
const TRACK_HALF_WIDTH = Math.sqrt(TUBE_RADIUS ** 2 - TUBE_AXIS_OFFSET_Y ** 2) + TRACK_WALL_OVERLAP;
const TRACK_THICKNESS = 0.4;

const TRACK_COLOR = Color3.FromHexString("#2a7fd6"); // Azul original del piso
const TUBE_COLOR = Color3.FromHexString("#0a7fa8");  // Celeste del tubo
const TUBE_ALPHA = 0.2;

export const buildEmptyTunnel: UnitBuilderFn = (scene, unit, currentPosition, forwardDirection) => {
  // Aplicamos el multiplicador x10 de longitud que definiste
  const realLength = unit.length * 10; 
  const halfLengthVector = forwardDirection.scale(realLength / 2);
  const centerPosition = currentPosition.add(halfLengthVector);

  const unitMeshes: Mesh[] = [];

  // 1. GENERAR LOS PUNTOS DE LA TRAYECTORIA LINEAL
  const pointsCount = 6;
  const pathPoints: Vector3[] = [];
  for (let i = 0; i < pointsCount; i++) {
    const progress = (i / (pointsCount - 1)) * realLength;
    pathPoints.push(currentPosition.add(forwardDirection.scale(progress)));
  }

  // 2. CONSTRUIR EL PISO INTERNO (TRACK MESH) REUTILIZANDO TU FUNCIÓN ORIGINAL
  const floorMesh = createTrackMesh(scene, `${unit.id}-track`, pathPoints, {
    halfWidth: TRACK_HALF_WIDTH,
    thickness: TRACK_THICKNESS,
  });

  const trackMaterial = new StandardMaterial(`${unit.id}-track-mat`, scene);
  trackMaterial.diffuseColor = TRACK_COLOR;
  trackMaterial.emissiveColor = TRACK_COLOR.scale(0.25);
  trackMaterial.specularColor = new Color3(0.1, 0.1, 0.1);
  trackMaterial.backFaceCulling = false;
  trackMaterial.twoSidedLighting = true;
  floorMesh.material = trackMaterial;
  
  // Guardamos la malla del piso en el lote de la unidad
  unitMeshes.push(floorMesh as Mesh);

  // 3. CONSTRUIR LA CARCASA CILÍNDRICA DEL TÚNEL (TUBE)
  const tubePath = pathPoints.map(point => new Vector3(point.x, point.y + TUBE_AXIS_OFFSET_Y, point.z));
  
  const tubeMesh = CreateTube(
    `${unit.id}-tube`,
    {
      path: tubePath,
      radius: TUBE_RADIUS,
      tessellation: TUBE_TESSELLATION,
      sideOrientation: Mesh.DOUBLESIDE,
      updatable: false,
    },
    scene
  );

  const tubeMaterial = new StandardMaterial(`${unit.id}-tube-mat`, scene);
  tubeMaterial.diffuseColor = TUBE_COLOR;
  tubeMaterial.emissiveColor = TUBE_COLOR.scale(0.25);
  tubeMaterial.alpha = TUBE_ALPHA;
  tubeMaterial.backFaceCulling = false;
  tubeMesh.material = tubeMaterial;

  // Guardamos la carcasa del túnel en el lote de la unidad
  unitMeshes.push(tubeMesh as Mesh);

  return {
    centerPosition,
    meshes: unitMeshes, // Devuelve tanto el suelo como la carcasa juntos
    enemySpawns: [],
    nextPosition: currentPosition.add(forwardDirection.scale(realLength))
  };
};
