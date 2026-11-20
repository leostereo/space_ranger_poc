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
import { AssetRegistry } from "@/game/assets/asset-registry";

const SOLID_GLOW = 0.25;
const SOLID_SPECULAR = new Color3(0.1, 0.1, 0.1);
const TRACK_COLOR = Color3.FromHexString("#2a7fd6");
const TUBE_COLOR = Color3.FromHexString("#0a7fa8");
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

function applyJumpRampBeforeIndex(
  trackPoints: Vector3[],
  wallPointIndex: number,
  rampPeakHeight: number,
  rampLengthMeters = 28
): void {
  if (rampPeakHeight <= 0) return;

  // 1. Retrocedemos ~15 metros desde la pared para ubicar el pico de despegue (cresta de la rampa)
  const gapBeforeWallMeters = 20;
  let distFromWall = 0;
  let peakIdx = wallPointIndex;
  while (peakIdx > 1 && distFromWall < gapBeforeWallMeters) {
    distFromWall += Vector3.Distance(trackPoints[peakIdx], trackPoints[peakIdx - 1]);
    peakIdx--;
  }

  // 2. Calculamos el inicio de la subida hacia atrás desde la cresta
  let accumulatedDist = 0;
  let startIdx = peakIdx;
  while (startIdx > 1 && accumulatedDist < rampLengthMeters) {
    accumulatedDist += Vector3.Distance(trackPoints[startIdx], trackPoints[startIdx - 1]);
    startIdx--;
  }

  // 3. Calculamos el final de la bajada justo antes de llegar a la pared (así la pared queda en el piso plano)
  let forwardDist = 0;
  let endIdx = peakIdx;
  const landingLengthMeters = 12;
  while (endIdx < wallPointIndex && forwardDist < landingLengthMeters) {
    forwardDist += Vector3.Distance(trackPoints[endIdx], trackPoints[endIdx + 1]);
    endIdx++;
  }

  const totalSpan = endIdx - startIdx;
  if (totalSpan <= 2) return;

  // Aplicamos la curva de elevación solo entre startIdx y endIdx (dejando el piso de la pared intacto)
  for (let i = startIdx; i <= endIdx; i++) {
    const t = (i - startIdx) / totalSpan;
    const elevation = Math.pow(Math.sin(Math.PI * t), 1.5) * rampPeakHeight;
    trackPoints[i].y += elevation;
  }
}

export function buildParametricPath(
  scene: Scene,
  unit: UnitData,
  currentPosition: Vector3,
  _forwardDirection: Vector3,
  registry: AssetRegistry
): UnitBuilderResult {
  const meshes: Mesh[] = [];
  const config = unit.parametricConfig;

  if (!config) {
    throw new Error(`[ParametricPath] Falta parametricConfig en la unidad ${unit.id}`);
  }

  // 1. GENERACIÓN DEL CAMINO 3D BASE
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

  const spline = Curve3.CreateCatmullRomSpline(controlPoints, 14, false);
  const trackPoints = spline.getPoints();

  // 2. PRE-CÁLCULO DE OBSTÁCULOS Y RAMPAS DE IMPULSO (Antes de construir las mallas del suelo)
  const TUNNEL_CLEAR_HEIGHT = TUBE_RADIUS + TUBE_AXIS_OFFSET_Y - 0.5;
  const MATRIX_TOTAL_WIDTH = TUBE_RADIUS * 2;
  const hitsRequired = config.breakableHitsRequired ?? 3;

  const unitBoxCount = config.unitBoxCount ?? 0;
  const matrixGapCount = config.includeTunnel ? (config.matrixWallGapCount ?? 0) : 0;
  const matrixBreakableCount = config.includeTunnel ? (config.matrixWallBreakableCount ?? 0) : 0;

  const totalObstacles =
    unitBoxCount +
    config.dodgeCount +
    config.jumpCount +
    config.breakableCount +
    matrixGapCount +
    matrixBreakableCount;

  const getPointIndexForSlot = (slot: number): number => {
    const fraction = slot / (totalObstacles + 1);
    return Math.min(
      trackPoints.length - 2,
      Math.max(1, Math.floor(fraction * (trackPoints.length - 1)))
    );
  };

  // Sorteamos de antemano las celdas objetivo de cada matriz 3x3 y generamos su rampa si hace falta
  const basicObstaclesCount = unitBoxCount + config.jumpCount + config.dodgeCount + config.breakableCount;
  const matrixPlans: Array<{ mode: "gap" | "breakable"; slot: number; targetCellIndex: number }> = [];

  for (let i = 0; i < matrixGapCount; i++) {
    matrixPlans.push({
      mode: "gap",
      slot: basicObstaclesCount + i + 1,
      targetCellIndex: Math.floor(Math.random() * 9),
    });
  }
  for (let i = 0; i < matrixBreakableCount; i++) {
    matrixPlans.push({
      mode: "breakable",
      slot: basicObstaclesCount + matrixGapCount + i + 1,
      targetCellIndex: Math.floor(Math.random() * 9),
    });
  }

  // Aplicamos la rampa de elevación sobre `trackPoints` antes de extruir el piso y el tubo
  for (const plan of matrixPlans) {
    const targetRow = Math.floor(plan.targetCellIndex / 3); // 0 = arriba, 1 = medio, 2 = abajo
    const wallIndex = getPointIndexForSlot(plan.slot);

    if (targetRow === 1) {
      // Fila media: rampa suave de ~3.8m para entrar saltando cómodo
      applyJumpRampBeforeIndex(trackPoints, wallIndex, 3.8, 28);
    } else if (targetRow === 0) {
      // Fila superior: rampa pronunciada de ~8.2m para alcanzar el nivel alto
      applyJumpRampBeforeIndex(trackPoints, wallIndex, 8.2, 38);
    }
  }

  // Capturamos extremos tras deformar las rampas
  const nextPosition = trackPoints[trackPoints.length - 1].clone();
  const centerPosition = trackPoints[Math.floor(trackPoints.length / 2)].clone();

  // 3. CONSTRUCCIÓN DEL SUELO (Ya incluye las rampas integradas de forma fluida)
  const trackMaterial = createTrackMaterial(scene, `${unit.id}-track-mat`, TRACK_COLOR);
  trackMaterial.twoSidedLighting = true;

  const floorMesh = createTrackMesh(scene, `${unit.id}-track`, trackPoints, {
    halfWidth: TRACK_HALF_WIDTH,
    thickness: TRACK_THICKNESS,
  });
  floorMesh.material = trackMaterial;
  floorMesh.checkCollisions = true;
  meshes.push(floorMesh);

  // 4. INCLUSIÓN CONDICIONAL DEL TÚNEL (Sigue las rampas manteniendo la altura libre)
  if (config.includeTunnel) {
    const isStraight =
      config.upSegments === 0 &&
      config.downSegments === 0 &&
      config.curveRightSegments === 0 &&
      config.curveLeftSegments === 0 &&
      matrixPlans.every((p) => Math.floor(p.targetCellIndex / 3) === 2); // Sin rampas de salto

    const TUBE_PATH_STEP = isStraight ? 12 : 4;
    const tubePath = trackPoints
      .filter((_, index) => index % TUBE_PATH_STEP === 0 || index === trackPoints.length - 1)
      .map((point) => new Vector3(point.x, point.y + TUBE_AXIS_OFFSET_Y, point.z));

    const tubeMesh = CreateTube(
      `${unit.id}-tube`,
      {
        path: tubePath,
        radius: TUBE_RADIUS,
        tessellation: 12, // 🟢 Límite visual redondo óptimo
        sideOrientation: Mesh.BACKSIDE,
        cap: Mesh.NO_CAP,
        updatable: false,
      },
      scene
    );

    const tubeMat = createTrackMaterial(scene, `${unit.id}-tube-mat`, TUBE_COLOR);
    tubeMat.alpha = TUBE_ALPHA;
    tubeMat.backFaceCulling = true; // 🟢 No renderiza caras exteriores innecesarias
    tubeMesh.material = tubeMat;
    tubeMesh.checkCollisions = true;
    meshes.push(tubeMesh);
  }

  // 5. INSTANCIACIÓN DE OBSTÁCULOS SOBRE LA PISTA FINAL
  const carriles = [-3, 0, 3];
  let obstacleSlot = 1;

  const getTransformAtSlot = (slot: number, lateralX: number): { position: Vector3; headingY: number } | null => {
    if (totalObstacles === 0 || slot > totalObstacles) return null;

    const pointIndex = getPointIndexForSlot(slot);
    const point = trackPoints[pointIndex];
    const nextPoint = trackPoints[pointIndex + 1];

    const tangent = nextPoint.subtract(point).normalize();
    const headingY = Math.atan2(tangent.x, tangent.z);
    const rightVector = new Vector3(Math.cos(headingY), 0, -Math.sin(headingY)).normalize();
    const position = point.add(rightVector.scale(lateralX));
    return { position, headingY };
  };
  // Cajas Unitarias
  for (let i = 0; i < unitBoxCount; i++) {
    const carril = carriles[i % carriles.length];
    const transform = getTransformAtSlot(obstacleSlot++, carril);
    if (!transform) break;
    meshes.push(
      createUnitBox(scene, registry, {
        name: `${unit.id} - unit - ${i}`,
        position: transform.position,
        headingY: transform.headingY,
      })
    );
  }
  // Vallas de Salto
  for (let i = 0; i < config.jumpCount; i++) {
    const transform = getTransformAtSlot(obstacleSlot++, 0);
    if (!transform) break;
    meshes.push(
      createJumpBar(scene, registry, {
        name: `${unit.id} - jump - ${i}`,
        position: transform.position,
        headingY: transform.headingY,
        trackWidth: TRACK_WIDTH,
      })
    );
  }
  // Columnas y Paredes Laterales
  for (let i = 0; i < config.dodgeCount; i++) {
    const carril = carriles[i % carriles.length];
    if (i % 2 === 0) {
      const transform = getTransformAtSlot(obstacleSlot++, carril);
      if (!transform) break;
      meshes.push(
        createDodgePillar(scene, registry, {
          name: `${unit.id} - pillar - ${i}`,
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
      const transform = getTransformAtSlot(obstacleSlot++, lateralX);
      if (!transform) break;
      meshes.push(
        createDodgeWall(scene, registry, {
          name: `${unit.id} - wall - ${i}`,
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
    const transform = getTransformAtSlot(obstacleSlot++, carril);
    if (!transform) break;
    meshes.push(
      createBreakableBox(scene, registry, {
        name: `${unit.id} - breakable - ${i}`,
        position: transform.position,
        headingY: transform.headingY,
        widthUnits: 10,
        depthUnits: 10,
        hitsRequired,
      })
    );
  }
  // Paredes Matriz 3x3 alineadas con las rampas generadas
  matrixPlans.forEach((plan, index) => {
    const transform = getTransformAtSlot(plan.slot, 0);
    if (!transform) return;
    const wallMeshes = createTunnelMatrixWall(scene, registry, {
      name: ` ${unit.id} - matrix - ${plan.mode} - ${index}`,
      position: transform.position,
      headingY: transform.headingY,
      totalWidth: MATRIX_TOTAL_WIDTH,
      totalHeight: TUNNEL_CLEAR_HEIGHT,
      mode: plan.mode,
      hitsRequired,
      targetSlotIndex: plan.targetCellIndex,
    });
    meshes.push(...wallMeshes);
  });
  return {
    meshes,
    enemySpawns: [],
    centerPosition,
    nextPosition,
  };
}