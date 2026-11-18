import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

import type { AssetRegistry } from "../../assets/asset-registry"; // Ajustar ruta relativa si hace falta
import type { UnitData, UnitBuilderResult } from "../unit-builder.types";
import { createCoverBox, createBreakableBox } from "../procedural/obstacle-builder";

const FLOOR_THICKNESS = 0.4;
const FLOOR_EDGE_COLOR = new Color4(0.22, 0.74, 0.97, 0.6); // Celeste sutil para delimitar el borde de la plaza

export function buildShootingPlayground(
  scene: Scene,
  unit: UnitData,
  currentPosition: Vector3,
  forwardDirection: Vector3,
  registry: AssetRegistry
): UnitBuilderResult {
  const meshes: Mesh[] = [];
  const config = unit.playgroundConfig ?? {
    width: 30,
    coverRows: 3,
    coversPerRow: 4,
    breakableRatio: 0.3,
    staticDroneCount: 3,
  };

  // 1. Calcular centros y punto de salida hacia la siguiente unidad
  const centerPosition = currentPosition.add(forwardDirection.scale(unit.length * 0.5));
  const nextPosition = currentPosition.add(forwardDirection.scale(unit.length));

  // 2. Construir el piso de la plaza (cara superior exactamente en currentPosition.y)
  const floor = CreateBox(
    `${unit.id}-floor`,
    {
      width: config.width,
      height: FLOOR_THICKNESS,
      depth: unit.length,
    },
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

  // Resaltado sutil de bordes para que se distinga el límite del vacío
  floor.enableEdgesRendering();
  floor.edgesWidth = 2.0;
  floor.edgesColor = FLOOR_EDGE_COLOR;

  floor.setEnabled(true); // Regla crítica de Havok
  meshes.push(floor);

  // 3. Distribuir coberturas en los primeros dos tercios de la arena (deja el fondo libre para los drones)
  const combatZoneLength = unit.length * 0.65;
  const startZ = currentPosition.z + unit.length * 0.15;
  const rowSpacing = combatZoneLength / Math.max(1, config.coverRows);
  const usableWidth = config.width * 0.8;

  for (let row = 0; row < config.coverRows; row++) {
    const zPos = startZ + row * rowSpacing;
    const colSpacing = usableWidth / Math.max(1, config.coversPerRow);
    // Desfase alternado por fila para evitar pasillos rectos sin cobertura
    const rowOffset = (row % 2 === 0 ? -1 : 1) * (colSpacing * 0.25);

    for (let col = 0; col < config.coversPerRow; col++) {
      const xPos =
        currentPosition.x -
        usableWidth * 0.5 +
        colSpacing * (col + 0.5) +
        rowOffset;

      const spawnPos = new Vector3(xPos, currentPosition.y, zPos);

      // Patrón determinista según breakableRatio (evita aleatoriedad distinta entre recargas)
      const ratio = config.breakableRatio ?? 0.3;
      const isBreakable = ratio > 0 && ((row * 3 + col) % Math.round(1 / ratio)) === 0;

      const obstacle = isBreakable
        ? createBreakableBox(scene, registry, {
            name: `${unit.id}-breakable-${row}-${col}`,
            position: spawnPos,
            hitsRequired: 3,
          })
        : createCoverBox(scene, registry, {
            name: `${unit.id}-cover-${row}-${col}`,
            position: spawnPos,
          });

      obstacle.setEnabled(true);
      meshes.push(obstacle);
    }
  }

  return {
    meshes,
    enemySpawns: [], // Se calculan previamente en createPreCalculatedSpawns()
    centerPosition,
    nextPosition,
  };
}
