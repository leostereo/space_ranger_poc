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
import {
  UNIT,
  createUnitBox,
  createJumpBar,
  createDodgePillar,
  createDodgeWall,
  createBreakableBox,
  createTunnelMatrixWall,
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

/** Calcula el largo individual de cada tramo dividiendo el largo total de la unidad */
function getSegmentLength(totalLength: number, config: ParametricPathConfig): number {
  const totalSegments = Math.max(
    1,
    config.straightSegments +
    config.upSegments +
    config.downSegments +
    config.curveRightSegments +
    config.curveLeftSegments
  );
  return totalLength / totalSegments;
}

/** Función pura compartida para calcular el final del camino sin instanciar mallas */
export function calculateParametricEndPosition(
  startPosition: Vector3,
  totalLength: number,
  config: ParametricPathConfig
): Vector3 {
  let lastPoint = startPosition.clone();
  const segLen = getSegmentLength(totalLength, config);

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
  const segLen = getSegmentLength(unit.length, config);

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
        cap: Mesh.NO_CAP,
        updatable: false,
      },
      scene
    );

    const tubeMat = createTrackMaterial(scene, `${unit.id}-tube-mat`, TUBE_COLOR);
    tubeMat.alpha = TUBE_ALPHA;
    tubeMesh.material = tubeMat;
    tubeMesh.checkCollisions = true;
    meshes.push(tubeMesh);
  }

  // 4. DISTRIBUCIÓN EQUIDISTANTE GARANTIZADA DE OBSTÁCULOS
  const TUNNEL_CLEAR_HEIGHT = TUBE_RADIUS + TUBE_AXIS_OFFSET_Y - 0.5;
  const MATRIX_TOTAL_WIDTH = TUBE_RADIUS * 2;

  const unitBoxCount = config.unitBoxCount ?? 0;
  const matrixGapCount = config.includeTunnel ? (config.matrixWallGapCount ?? 0) : 0;
  const matrixBreakableCount = config.includeTunnel ? (config.matrixWallBreakableCount ?? 0) : 0;
  const hitsRequired = config.breakableHitsRequired ?? 3;

  const totalObstacles =
    unitBoxCount +
    config.dodgeCount +
    config.jumpCount +
    config.breakableCount +
    matrixGapCount +
    matrixBreakableCount;

  const carriles = [-3, 0, 3];
  let obstacleSlot = 1;

  /** Calcula la posición y rotación sobre la curva usando slots equidistantes */
  const getNextCurveTransform = (lateralX: number): { position: Vector3; headingY: number } | null => {
    if (totalObstacles === 0 || obstacleSlot > totalObstacles) return null;

    const fraction = obstacleSlot / (totalObstacles + 1);
    const pointIndex = Math.min(
      trackPoints.length - 2,
      Math.max(1, Math.floor(fraction * (trackPoints.length - 1)))
    );

    const point = trackPoints[pointIndex];
    const nextPoint = trackPoints[pointIndex + 1];

    const tangent = nextPoint.subtract(point).normalize();
    const headingY = Math.atan2(tangent.x, tangent.z);
    const rightVector = new Vector3(Math.cos(headingY), 0, -Math.sin(headingY)).normalize();

    const position = point.add(rightVector.scale(lateralX));
    obstacleSlot++;

    return { position, headingY };
  };

  // Cajas Unitarias de Referencia
  for (let i = 0; i < unitBoxCount; i++) {
    const carril = carriles[i % carriles.length];
    const transform = getNextCurveTransform(carril);
    if (!transform) break;

    meshes.push(
      createUnitBox(scene, {
        name: `${unit.id}-unit-${i}`,
        position: transform.position,
        headingY: transform.headingY,
      })
    );
  }

  // Vallas de Salto
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

  // Columnas y Paredes Laterales de Evasión
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
          widthUnits: 10,
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

      meshes.push(
        createDodgeWall(scene, {
          name: `${unit.id}-wall-${i}`,
          position: transform.position,
          headingY: transform.headingY,
          widthUnits: wallWidthUnits,
          depthUnits: 5,
        })
      );
    }
  }

  // Cajas Destruibles Individuales
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
      hitsRequired,
    })
  );
  }

  // Paredes Matriz 3x3 con Hueco Libre
  for (let i = 0; i < matrixGapCount; i++) {
    const transform = getNextCurveTransform(0);
    if (!transform) break;

    const wallMeshes = createTunnelMatrixWall(scene, {
      name: `${unit.id}-matrix-gap-${i}`,
      position: transform.position,
      headingY: transform.headingY,
      totalWidth: MATRIX_TOTAL_WIDTH,
      totalHeight: TUNNEL_CLEAR_HEIGHT,
      mode: "gap",
    });
    meshes.push(...wallMeshes);
  }
  // Paredes Matriz 3x3 con Bloque Destruible
  for (let i = 0; i < matrixBreakableCount; i++) {
    const transform = getNextCurveTransform(0);
    if (!transform) break;
    // En Paredes Matriz 3x3 con Bloque Destruible:
    const wallMeshes = createTunnelMatrixWall(scene, {
      name: `${unit.id}-matrix-breakable-${i}`,
      position: transform.position,
      headingY: transform.headingY,
      totalWidth: MATRIX_TOTAL_WIDTH,
      totalHeight: TUNNEL_CLEAR_HEIGHT,
      mode: "breakable",
      hitsRequired,
    });
    meshes.push(...wallMeshes);
  }
  return {
    meshes,
    enemySpawns: [],
    centerPosition,
  nextPosition,
};
}