// src/game/levels/builders/parametric-path.builder.ts
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Curve3 } from "@babylonjs/core/Maths/math.path";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { UnitData, UnitBuilderResult, ParametricPathConfig } from "../unit-builder.types";

import { createTrackMesh } from "../procedural/track-builder";
// 🟢 Importamos nuestra nueva fábrica reutilizable de obstáculos
import {
  UNIT,
  createJumpBar,
  createDodgePillar,
  createBreakableBox,
  createCoverBox, // Usaremos este formato ancho para las paredes de evasión lateral
} from "../procedural/obstacle-builder";

const SOLID_GLOW = 0.25;
const SOLID_SPECULAR = new Color3(0.1, 0.1, 0.1);
const TRACK_COLOR = Color3.FromHexString("#2a7fd6");  // Azul pista
const TUBE_COLOR = Color3.FromHexString("#0a7fa8");   // Azul translúcido
const TUBE_ALPHA = 0.2;

const TUBE_WIDTH_SCALE = 1.5;
const TUBE_RADIUS = 8 * TUBE_WIDTH_SCALE;
const TUBE_AXIS_OFFSET_Y = 4.8 * TUBE_WIDTH_SCALE; 
const TUBE_TESSELLATION = 20;
const TRACK_WALL_OVERLAP = 0.15;
const TRACK_HALF_WIDTH = Math.sqrt(TUBE_RADIUS ** 2 - TUBE_AXIS_OFFSET_Y ** 2) + TRACK_WALL_OVERLAP;
const TRACK_WIDTH = TRACK_HALF_WIDTH * 2;
const TRACK_THICKNESS = 0.4;

const createTrackMaterial = (scene: Scene, name: string, color: Color3): StandardMaterial => {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.emissiveColor = color.scale(SOLID_GLOW);
  material.specularColor = SOLID_SPECULAR;
  material.backFaceCulling = false;
  return material;
};

/** Función pura compartida para calcular el final del camino sin instanciar mallas */
export function calculateParametricEndPosition(
  startPosition: Vector3, 
  config: ParametricPathConfig
): Vector3 {
  let lastPoint = startPosition.clone();
  const segLen = config.segmentLength;

  lastPoint = lastPoint.add(new Vector3(0, 0, segLen * config.straightSegments));
  lastPoint = lastPoint.add(new Vector3(0, segLen * 0.2 * config.upSegments, segLen * config.upSegments));
  lastPoint = lastPoint.add(new Vector3(segLen * 0.25 * config.curveRightSegments, 0, segLen * config.curveRightSegments));
  lastPoint = lastPoint.add(new Vector3(-segLen * 0.25 * config.curveLeftSegments, 0, segLen * config.curveLeftSegments));
  lastPoint = lastPoint.add(new Vector3(0, -segLen * 0.2 * config.downSegments, segLen * config.downSegments));

  return lastPoint;
}

export function buildParametricPath(
  scene: Scene,
  unit: UnitData,
  currentPosition: Vector3,
  forwardDirection: Vector3
): UnitBuilderResult {
  const meshes: Mesh[] = [];
  const config = unit.parametricConfig;

  if (!config) {
    throw new Error(`[ParametricPath] Falta parametricConfig en la unidad ${unit.id}`);
  }

  // 1. GENERACIÓN DEL CAMINO 3D (Puntos de control base)
  const controlPoints: Vector3[] = [currentPosition.clone()];
  let lastPoint = currentPosition.clone();
  const segLen = config.segmentLength;

  for (let i = 0; i < config.straightSegments; i++) {
    lastPoint = lastPoint.add(new Vector3(0, 0, segLen));
    controlPoints.push(lastPoint.clone());
  }
  for (let i = 0; i < config.upSegments; i++) {
    lastPoint = lastPoint.add(new Vector3(0, segLen * 0.2, segLen));
    controlPoints.push(lastPoint.clone());
  }
  for (let i = 0; i < config.curveRightSegments; i++) {
    lastPoint = lastPoint.add(new Vector3(segLen * 0.25, 0, segLen));
    controlPoints.push(lastPoint.clone());
  }
  for (let i = 0; i < config.curveLeftSegments; i++) {
    lastPoint = lastPoint.add(new Vector3(-segLen * 0.25, 0, segLen));
    controlPoints.push(lastPoint.clone());
  }
  for (let i = 0; i < config.downSegments; i++) {
    lastPoint = lastPoint.add(new Vector3(0, -segLen * 0.2, segLen));
    controlPoints.push(lastPoint.clone());
  }

  const spline = Curve3.CreateCatmullRomSpline(controlPoints, 24, false);
  const trackPoints = spline.getPoints();

  const nextPosition = trackPoints[trackPoints.length - 1].clone();
  const centerPosition = trackPoints[Math.floor(trackPoints.length / 2)].clone();

  // 2. CONSTRUCCIÓN DEL SUELO (Pista colisionable)
  const trackMaterial = createTrackMaterial(scene, `${unit.id}-track-mat`, TRACK_COLOR);
  trackMaterial.twoSidedLighting = true;

  const floorMesh = createTrackMesh(scene, `${unit.id}-track`, trackPoints, {
    halfWidth: TRACK_HALF_WIDTH,
    thickness: TRACK_THICKNESS,
  });
  floorMesh.material = trackMaterial;
  floorMesh.checkCollisions = true;
  meshes.push(floorMesh);

  // 3. INCLUSIÓN CONDICIONAL DEL TÚNEL
  if (config.includeTunnel) {
    const tubePath = trackPoints.map((point) => new Vector3(point.x, point.y + TUBE_AXIS_OFFSET_Y, point.z));
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
    
    const tubeMat = createTrackMaterial(scene, `${unit.id}-tube-mat`, TUBE_COLOR);
    tubeMat.alpha = TUBE_ALPHA;
    tubeMesh.material = tubeMat;
    tubeMesh.checkCollisions = false;
    meshes.push(tubeMesh);
  }

  // 4. DISTRIBUCIÓN DE OBSTÁCULOS REUTILIZANDO `obstacle-builder.ts`
  const totalObstacles = config.dodgeCount + config.jumpCount + config.breakableCount;
  const indexStep = Math.floor(trackPoints.length / (totalObstacles + 2));
  let currentPointIndex = indexStep;

  const carriles = [-3, 0, 3]; 

  /** Calcula la posición y rotación sobre la curva en el paso actual */
  const getNextCurveTransform = (lateralX: number): { position: Vector3; headingY: number } | null => {
    if (currentPointIndex >= trackPoints.length - 2) return null;

    const point = trackPoints[currentPointIndex];
    const nextPoint = trackPoints[currentPointIndex + 1];

    const tangent = nextPoint.subtract(point).normalize();
    const headingY = Math.atan2(tangent.x, tangent.z);
    const rightVector = new Vector3(Math.cos(headingY), 0, -Math.sin(headingY)).normalize();

    const position = point.add(rightVector.scale(lateralX));
    currentPointIndex += indexStep;

    return { position, headingY };
  };

  // Vallas de Salto (Verdes)
  for (let i = 0; i < config.jumpCount; i++) {
    const transform = getNextCurveTransform(0);
    if (!transform) break;

    meshes.push(
      createJumpBar(scene, {
        name: `${unit.id}-jump-${i}`,
        position: transform.position,
        headingY: transform.headingY,
        trackWidth: TRACK_WIDTH,
      })
    );
  }

  // Columnas/Paredes de Evasión (Violetas)
  for (let i = 0; i < config.dodgeCount; i++) {
    const carril = carriles[i % carriles.length];
    
    if (i % 2 === 0) {
      const transform = getNextCurveTransform(carril);
      if (!transform) break;

      meshes.push(
        createDodgePillar(scene, {
          name: `${unit.id}-pillar-${i}`,
          position: transform.position,
          headingY: transform.headingY,
          widthUnits: 10, // Equivalente a tus 4 metros anteriores (10 * 0.4)
          depthUnits: 10,
        })
      );
    } else {
      const wallWidthUnits = Math.round((TRACK_WIDTH * 0.6) / UNIT);
      const wallWidth = wallWidthUnits * UNIT;
      const side = carril === -3 ? -1 : 1;
      const lateralX = side * (TRACK_HALF_WIDTH - wallWidth / 2);
      
      const transform = getNextCurveTransform(lateralX);
      if (!transform) break;

      // Nota: Si querés que las paredes laterales sean violetas en vez de grises,
      // podemos sumar `createDodgeWall` a `obstacle-builder.ts`
      meshes.push(
        createCoverBox(scene, {
          name: `${unit.id}-wall-${i}`,
          position: transform.position,
          headingY: transform.headingY,
          widthUnits: wallWidthUnits,
          depthUnits: 5,
        })
      );
    }
  }

  // Cajas Destruibles (Rojas)
  for (let i = 0; i < config.breakableCount; i++) {
    const carril = carriles[(i + 1) % carriles.length];
    const transform = getNextCurveTransform(carril);
    if (!transform) break;

    meshes.push(
      createBreakableBox(scene, {
        name: `${unit.id}-breakable-${i}`,
        position: transform.position,
        headingY: transform.headingY,
        widthUnits: 10,
        depthUnits: 10,
      })
    );
  }

  return {
    meshes,
    enemySpawns: [],
    centerPosition,
    nextPosition
  };
}
