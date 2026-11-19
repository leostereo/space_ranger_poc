// src/game/levels/builders/parametric-tunnel.builder.ts
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Curve3 } from "@babylonjs/core/Maths/math.path";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { UnitData, UnitBuilderResult, ParametricTunnelConfig } from "../unit-builder.types";
import { createTunnelMatrixWall } from "../procedural/obstacle-builder";
import { AssetRegistry } from "@/game/assets/asset-registry";

// 🟢 Constantes parametrizables para la extrusión de las paredes matriz 3x3 en dirección forward
const MIN_WALL_EXTRUDE_DEPTH = 3;
const MAX_WALL_EXTRUDE_DEPTH = 10;

// Dimensiones interiores de la sección rectangular del túnel
const TUNNEL_WIDTH = 24;
const TUNNEL_HALF_WIDTH = TUNNEL_WIDTH / 2;
const TUNNEL_HEIGHT = 18;
const WALL_THICKNESS = 0.6;

// Gama de grises con materiales compartidos en la escena
const FLOOR_GRAY_COLOR = Color3.FromHexString("#475569");   // Gris pizarra claro para el suelo
const WALL_GRAY_COLOR = Color3.FromHexString("#1e293b");    // Gris carbón oscuro para paredes
const CEILING_GRAY_COLOR = Color3.FromHexString("#0f172a"); // Gris casi negro para el techo

const getSharedGrayMaterial = (scene: Scene, key: "floor" | "wall" | "ceiling"): StandardMaterial => {
  const matName = `shared-tunnel-gray-${key}`;
  const existing = scene.getMaterialByName(matName) as StandardMaterial;
  if (existing) return existing;

  const colorMap = {
    floor: FLOOR_GRAY_COLOR,
    wall: WALL_GRAY_COLOR,
    ceiling: CEILING_GRAY_COLOR,
  };

  const color = colorMap[key];
  const mat = new StandardMaterial(matName, scene);
  mat.diffuseColor = color;
  mat.emissiveColor = color.scale(0.22); // Iluminación propia suave para ver bien en interior cerrado
  mat.specularColor = new Color3(0.15, 0.15, 0.15);
  return mat;
};

function getSegmentLength(totalLength: number, config: ParametricTunnelConfig): number {
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

/** Función pura para que createPreCalculatedSpawns calcule el fin del túnel sin mallas */
export function calculateRectangularTunnelEndPosition(
  startPosition: Vector3,
  totalLength: number,
  config: ParametricTunnelConfig
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

export function buildParametricTunnel(
  scene: Scene,
  unit: UnitData,
  currentPosition: Vector3,
  forwardDirection: Vector3,
  registry: AssetRegistry
): UnitBuilderResult {
  const meshes: Mesh[] = [];
  const config = unit.tunnelConfig;

  if (!config) {
    throw new Error(`[ParametricTunnel] Falta tunnelConfig en la unidad ${unit.id}`);
  }

  // 1. PUNTOS DE CONTROL 3D (Sin subdivisiones: 1 caja por segmento)
  const trackPoints: Vector3[] = [currentPosition.clone()];
  let lastPoint = currentPosition.clone();
  const segLen = getSegmentLength(unit.length, config);

  for (let i = 0; i < config.straightSegments; i++) {
    lastPoint = lastPoint.add(new Vector3(0, 0, segLen));
    trackPoints.push(lastPoint.clone());
  }
  for (let i = 0; i < config.upSegments; i++) {
    lastPoint = lastPoint.add(new Vector3(0, segLen * 0.2, segLen));
    trackPoints.push(lastPoint.clone());
  }
  for (let i = 0; i < config.curveRightSegments; i++) {
    lastPoint = lastPoint.add(new Vector3(segLen * 0.25, 0, segLen));
    trackPoints.push(lastPoint.clone());
  }
  for (let i = 0; i < config.curveLeftSegments; i++) {
    lastPoint = lastPoint.add(new Vector3(-segLen * 0.25, 0, segLen));
    trackPoints.push(lastPoint.clone());
  }
  for (let i = 0; i < config.downSegments; i++) {
    lastPoint = lastPoint.add(new Vector3(0, -segLen * 0.2, segLen));
    trackPoints.push(lastPoint.clone());
  }
  
  const nextPosition = trackPoints[trackPoints.length - 1].clone();
  const centerPosition = trackPoints[Math.floor(trackPoints.length / 2)].clone();

  const floorMat = getSharedGrayMaterial(scene, "floor");
  const wallMat = getSharedGrayMaterial(scene, "wall");
  const ceilingMat = getSharedGrayMaterial(scene, "ceiling");

  // 2. CONSTRUCCIÓN DE LA ESTRUCTURA RECTANGULAR OPACA (Piso, Techo y Paredes por tramo)
  for (let i = 0; i < trackPoints.length - 1; i++) {
    const p1 = trackPoints[i];
    const p2 = trackPoints[i + 1];

    const segmentCenter = Vector3.Center(p1, p2);
    const segmentVector = p2.subtract(p1);
    const segmentDist = segmentVector.length();

    const tangent = segmentVector.clone().normalize();
    const headingY = Math.atan2(tangent.x, tangent.z);
    const pitchX = -Math.asin(Math.max(-1, Math.min(1, tangent.y)));

    const rightVector = new Vector3(Math.cos(headingY), 0, -Math.sin(headingY)).normalize();
    // Solapamiento de +0.4m en profundidad para que no se vean rendijas de luz en las curvas
    const overlapDepth = segmentDist + 0.4;

    // Piso rectangular
    const floor = CreateBox(
      `${unit.id}-rect-floor-${i}`,
      { width: TUNNEL_WIDTH + WALL_THICKNESS * 2, height: WALL_THICKNESS, depth: overlapDepth },
      scene
    );
    floor.position.copyFrom(segmentCenter.add(new Vector3(0, -WALL_THICKNESS / 2, 0)));
    floor.rotation.set(pitchX, headingY, 0);
    floor.material = floorMat;
    floor.checkCollisions = true;
    meshes.push(floor);

    // Techo opaco
    const ceiling = CreateBox(
      `${unit.id}-rect-ceiling-${i}`,
      { width: TUNNEL_WIDTH + WALL_THICKNESS * 2, height: WALL_THICKNESS, depth: overlapDepth },
      scene
    );
    ceiling.position.copyFrom(segmentCenter.add(new Vector3(0, TUNNEL_HEIGHT + WALL_THICKNESS / 2, 0)));
    ceiling.rotation.set(pitchX, headingY, 0);
    ceiling.material = ceilingMat;
    ceiling.checkCollisions = true;
    meshes.push(ceiling);

    // Pared Izquierda opaca
    const leftWall = CreateBox(
      `${unit.id}-rect-lwall-${i}`,
      { width: WALL_THICKNESS, height: TUNNEL_HEIGHT, depth: overlapDepth },
      scene
    );
    leftWall.position.copyFrom(
      segmentCenter.add(rightVector.scale(-(TUNNEL_HALF_WIDTH + WALL_THICKNESS / 2))).add(new Vector3(0, TUNNEL_HEIGHT / 2, 0))
    );
    leftWall.rotation.set(pitchX, headingY, 0);
    leftWall.material = wallMat;
    leftWall.checkCollisions = true;
    meshes.push(leftWall);

    // Pared Derecha opaca
    const rightWall = CreateBox(
      `${unit.id}-rect-rwall-${i}`,
      { width: WALL_THICKNESS, height: TUNNEL_HEIGHT, depth: overlapDepth },
      scene
    );
    rightWall.position.copyFrom(
      segmentCenter.add(rightVector.scale(TUNNEL_HALF_WIDTH + WALL_THICKNESS / 2)).add(new Vector3(0, TUNNEL_HEIGHT / 2, 0))
    );
    rightWall.rotation.set(pitchX, headingY, 0);
    rightWall.material = wallMat;
    rightWall.checkCollisions = true;
    meshes.push(rightWall);
  }

  // 3. OBSTÁCULOS MATRIZ 3x3 EXTRUIDOS EN DIRECCIÓN FORWARD (Profundidad entre MIN y MAX)
  const totalMatrices = config.matrixWallGapCount + config.matrixWallBreakableCount;
  const hitsRequired = config.breakableHitsRequired ?? 3;
  let slot = 1;

  const spawnMatrixAtNextSlot = (mode: "gap" | "breakable", idx: number) => {
    if (totalMatrices === 0 || slot > totalMatrices) return;

    const fraction = slot / (totalMatrices + 1);
    const pointIndex = Math.min(
      trackPoints.length - 2,
      Math.max(1, Math.floor(fraction * (trackPoints.length - 1)))
    );

    const point = trackPoints[pointIndex];
    const nextPoint = trackPoints[pointIndex + 1];
    const tangent = nextPoint.subtract(point).normalize();
    const headingY = Math.atan2(tangent.x, tangent.z);

    // 🟢 Extrusión aleatoria entre MIN_WALL_EXTRUDE_DEPTH (3) y MAX_WALL_EXTRUDE_DEPTH (10)
    const extrudeDepth =
      MIN_WALL_EXTRUDE_DEPTH + Math.random() * (MAX_WALL_EXTRUDE_DEPTH - MIN_WALL_EXTRUDE_DEPTH);

    const wallMeshes = createTunnelMatrixWall(scene,registry, {
      name: `${unit.id}-matrix-${mode}-${idx}`,
      position: point,
      headingY,
      totalWidth: TUNNEL_WIDTH,
      totalHeight: TUNNEL_HEIGHT,
      depth: extrudeDepth,
      mode,
      hitsRequired,
      theme: "gray", // Gama de grises unificada
    });

    meshes.push(...wallMeshes);
    slot++;
  };

  for (let i = 0; i < config.matrixWallGapCount; i++) {
    spawnMatrixAtNextSlot("gap", i);
  }

  for (let i = 0; i < config.matrixWallBreakableCount; i++) {
    spawnMatrixAtNextSlot("breakable", i);
  }

  return {
    meshes,
    enemySpawns: [],
    centerPosition,
    nextPosition,
  };
}
