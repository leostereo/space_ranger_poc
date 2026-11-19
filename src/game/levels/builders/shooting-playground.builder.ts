import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

import type { AssetRegistry } from "../../assets/asset-registry";
import type {
  UnitData,
  UnitBuilderResult,
  NavCell,
  PlaygroundNavGrid,
} from "../unit-builder.types";
import {
  UNIT,
  createLowCoverBox,
  createHighPlatform,
  createStepBlock,
} from "../procedural/obstacle-builder";

const FLOOR_THICKNESS = 0.4;
const FLOOR_EDGE_COLOR = new Color4(0.22, 0.74, 0.97, 0.6);
const CELL_SIZE = 4 * UNIT; // 1.6m por celda de grilla (permite paso cómodo del jugador de 0.8m)

type BlockArchetype = "low_cover" | "high_platform" | "step_block";

interface PlannedBlock {
  readonly col: number;
  readonly row: number;
  readonly baseHeightOffset: number; // Altura acumulada en Y donde se apoya este bloque
  readonly archetype: BlockArchetype;
  readonly headingY: number;
  readonly vertical: boolean;
  isBreakable: boolean;
}

/** Calcula la altura exacta en metros que ocupará el bloque según su arquetipo y orientación */
function getBlockHeight(archetype: BlockArchetype, vertical: boolean): number {
  if (archetype === "high_platform") {
    return vertical ? 4 * UNIT : 3.5 * UNIT;
  }
  if (archetype === "step_block") {
    return vertical ? 4 * UNIT : 1.75 * UNIT;
  }
  // low_cover
  return vertical ? 3.8 * UNIT : 1.35 * UNIT;
}

/** Generador pseudoaleatorio liviano (Mulberry32) para soportar semilla opcional */
function createRng(seed?: number): () => number {
  let state = seed ?? Math.floor(Math.random() * 0xffffffff);
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildShootingPlayground(
  scene: Scene,
  unit: UnitData,
  currentPosition: Vector3,
  forwardDirection: Vector3,
  registry: AssetRegistry
): UnitBuilderResult {
  const meshes: Mesh[] = [];
  const config = unit.playgroundConfig ?? {
    width: 24,
    groupingMin: 2,
    groupingMax: 5,
    breakablePercent: 0.25,
    freeResultingSpace: 0.72,
    staticDroneCount: 3,
  };

  const rng = createRng(config.seed);

  // 1. Piso de la arena
  const centerPosition = currentPosition.add(forwardDirection.scale(unit.length * 0.5));
  const nextPosition = currentPosition.add(forwardDirection.scale(unit.length));

  const floor = CreateBox(
    `${unit.id}-floor`,
    { width: config.width, height: FLOOR_THICKNESS, depth: unit.length },
    scene
  );
  floor.position.set(
    centerPosition.x,
    currentPosition.y - FLOOR_THICKNESS * 0.5,
    centerPosition.z
  );
  floor.material = registry.getMaterial("arena-floor");
  floor.checkCollisions = true;
  floor.isPickable = true;
  floor.enableEdgesRendering();
  floor.edgesWidth = 2.0;
  floor.edgesColor = FLOOR_EDGE_COLOR;
  meshes.push(floor);

  // 2. Configurar grilla 2D de estado y mapa de alturas acumuladas (en metros)
  const cols = Math.max(3, Math.floor(config.width / CELL_SIZE));
  const rows = Math.max(4, Math.floor(unit.length / CELL_SIZE));
  const gridOriginX = currentPosition.x - (cols * CELL_SIZE) * 0.5;
  const gridOriginZ = currentPosition.z;

  // Estados de celda: 0 = libre, 1 = reservada (entrada/salida), 2 = ocupada
  const grid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  const heightGrid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  const layerCountGrid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  const canStackGrid: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(true));

  const safeMarginRows = Math.min(2, Math.floor(rows * 0.2));
  for (let r = 0; r < rows; r++) {
    if (r < safeMarginRows || r >= rows - safeMarginRows) {
      grid[r].fill(1);
    }
  }

  const totalCells = cols * rows;
  const clampedFree = Math.min(0.95, Math.max(0.25, config.freeResultingSpace));
  const maxOccupiedCells = Math.floor(totalCells * (1 - clampedFree));
  let occupiedCellsCount = 0;

  const plannedBlocks: PlannedBlock[] = [];
  const directions: ReadonlyArray<{ readonly dc: number; readonly dr: number }> = [
    { dc: 0, dr: 1 },
    { dc: 0, dr: -1 },
    { dc: 1, dr: 0 },
    { dc: -1, dr: 0 },
  ];
  const rotations = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
  const archetypes: BlockArchetype[] = ["low_cover", "low_cover", "step_block", "high_platform"];

  const MAX_STACK_LAYERS = 3;
  const STACK_PROBABILITY = 0.35;

  // 3. Generar grupos con bloques encimados y alturas irregulares
  let safetyCounter = 0;
  while (occupiedCellsCount < maxOccupiedCells && safetyCounter < 500) {
    safetyCounter++;

    const startCol = Math.floor(rng() * cols);
    const startRow = Math.floor(rng() * rows);
    if (grid[startRow][startCol] !== 0) continue;

    const minG = Math.max(1, config.groupingMin);
    const maxG = Math.max(minG, config.groupingMax);
    const targetGroupSize = minG + Math.floor(rng() * (maxG - minG + 1));

    let curCol = startCol;
    let curRow = startRow;

    for (let step = 0; step < targetGroupSize; step++) {
      const isNewCell = grid[curRow][curCol] === 0;
      if (isNewCell && occupiedCellsCount >= maxOccupiedCells) break;

      const canPlaceHere =
        isNewCell ||
        (grid[curRow][curCol] === 2 &&
          canStackGrid[curRow][curCol] &&
          layerCountGrid[curRow][curCol] < MAX_STACK_LAYERS);

      if (canPlaceHere) {
        if (isNewCell) {
          grid[curRow][curCol] = 2;
          occupiedCellsCount++;
        }

        const archetype = archetypes[Math.floor(rng() * archetypes.length)];
        const headingY = rotations[Math.floor(rng() * rotations.length)];
        // Solo permitimos bloques parados si es la base (capa 0) para mantener estabilidad visual
        const isBaseLayer = layerCountGrid[curRow][curCol] === 0;
        const vertical = isBaseLayer && archetype !== "high_platform" && rng() < 0.25;

        const baseHeightOffset = heightGrid[curRow][curCol];
        const blockHeight = getBlockHeight(archetype, vertical);

        plannedBlocks.push({
          col: curCol,
          row: curRow,
          baseHeightOffset,
          archetype,
          headingY,
          vertical,
          isBreakable: false,
        });

        heightGrid[curRow][curCol] += blockHeight;
        layerCountGrid[curRow][curCol] += 1;

        // Si se colocó un bloque vertical, no apilamos nada más encima de él
        if (vertical) {
          canStackGrid[curRow][curCol] = false;
        }
      }

      // Decidir si el siguiente bloque del grupo se apila encima o avanza a una celda vecina
      const tryStackSameCell =
        canStackGrid[curRow][curCol] &&
        layerCountGrid[curRow][curCol] < MAX_STACK_LAYERS &&
        rng() < STACK_PROBABILITY;

      if (tryStackSameCell) {
        continue; // Mantiene curCol y curRow para encimar el siguiente bloque
      }

      const shuffledDirs = [...directions].sort(() => rng() - 0.5);
      let moved = false;
      for (const dir of shuffledDirs) {
        const nextC = curCol + dir.dc;
        const nextR = curRow + dir.dr;
        if (
          nextC >= 0 &&
          nextC < cols &&
          nextR >= 0 &&
          nextR < rows &&
          grid[nextR][nextC] === 0
        ) {
          curCol = nextC;
          curRow = nextR;
          moved = true;
          break;
        }
      }
      if (!moved) break;
    }
  }


  // 4. Asignar exactamente el porcentaje solicitado de bloques destruibles
  const clampedBreakable = Math.min(1, Math.max(0, config.breakablePercent));
  const breakableTargetCount = Math.round(plannedBlocks.length * clampedBreakable);
  const indices = plannedBlocks.map((_, idx) => idx).sort(() => rng() - 0.5);

  for (let i = 0; i < breakableTargetCount; i++) {
    plannedBlocks[indices[i]].isBreakable = true;
  }

  // 5. Instanciar las mallas en BabylonJS
  plannedBlocks.forEach((block, index) => {
    const worldX = gridOriginX + (block.col + 0.5) * CELL_SIZE;
    const worldZ = gridOriginZ + (block.row + 0.5) * CELL_SIZE;
    const spawnPos = new Vector3(
      worldX,
      currentPosition.y + block.baseHeightOffset,
      worldZ
    );

    // El sufijo "-breakable" garantiza que level-08-definition lo registre con kind: "breakable"
    const namePrefix = block.isBreakable
      ? `${unit.id}-breakable-${index}`
      : `${unit.id}-block-${index}`;

    const opts = {
      name: namePrefix,
      position: spawnPos,
      headingY: block.headingY,
      vertical: block.vertical,
      isBreakable: block.isBreakable,
      hitsRequired: 3,
      // Ajustamos ancho para que encaje dentro de la celda sin superponerse con vecinos
      widthUnits: block.archetype === "high_platform" ? 4 : 3.8,
      depthUnits: block.archetype === "high_platform" ? 4 : 2.5,
    };

    let mesh: Mesh;
    if (block.archetype === "high_platform") {
      mesh = createHighPlatform(scene, registry, opts);
    } else if (block.archetype === "step_block") {
      mesh = createStepBlock(scene, registry, opts);
    } else {
      mesh = createLowCoverBox(scene, registry, opts);
    }

    meshes.push(mesh);
  });

  // 6. Construir mapa de celdas libres para el futuro NavMesh (Punto 5)
  const navCells: NavCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      navCells.push({
        col: c,
        row: r,
        worldCenter: new Vector3(
          gridOriginX + (c + 0.5) * CELL_SIZE,
          currentPosition.y,
          gridOriginZ + (r + 0.5) * CELL_SIZE
        ),
        isWalkable: grid[r][c] !== 2,
      });
    }
  }

  const navGrid: PlaygroundNavGrid = {
    cellSize: CELL_SIZE,
    cols,
    rows,
    origin: new Vector3(gridOriginX, currentPosition.y, gridOriginZ),
    cells: navCells,
  };

  return {
    meshes,
    enemySpawns: [],
    centerPosition,
    nextPosition,
    navGrid,
  };
}
