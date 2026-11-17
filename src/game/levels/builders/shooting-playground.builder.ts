import { Scene, MeshBuilder, Vector3, Mesh } from "@babylonjs/core";
import { UnitData, UnitBuilderResult } from "../unit-builder.types";
import { createCoverBox, createBreakableBox } from "../procedural/obstacle-builder";

const FLOOR_THICKNESS = 0.4;

export function buildShootingPlayground(
  scene: Scene,
  unit: UnitData,
  currentPosition: Vector3,
  forwardDirection: Vector3
): UnitBuilderResult {
  const meshes: Mesh[] = [];
  const config = unit.playgroundConfig ?? {
    width: 30,
    coverRows: 3,
    coversPerRow: 4,
    breakableRatio: 0.3,
    staticDroneCount: 3,
  };

  // 1. Calcular centros y salida
  const centerPosition = currentPosition.add(forwardDirection.scale(unit.length * 0.5));
  const nextPosition = currentPosition.add(forwardDirection.scale(unit.length));

  // 2. Construir el piso (cara superior alineada a currentPosition.y)
  const floor = MeshBuilder.CreateBox(
    `${unit.id}-floor`,
    {
      width: config.width,
      height: FLOOR_THICKNESS,
      depth: unit.length,
    },
    scene
  );
  floor.position = new Vector3(
    centerPosition.x,
    currentPosition.y - FLOOR_THICKNESS * 0.5,
    centerPosition.z
  );
  floor.setEnabled(true); // Regla crítica de Havok
  meshes.push(floor);

  // 3. Distribuir coberturas en los primeros dos tercios de la arena
  const combatZoneLength = unit.length * 0.65;
  const startZ = currentPosition.z + unit.length * 0.15;
  const rowSpacing = combatZoneLength / Math.max(1, config.coverRows);
  const usableWidth = config.width * 0.8; // Margen lateral de seguridad

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
      const isBreakable = Math.random() < (config.breakableRatio ?? 0.3);

      const obstacle = isBreakable
        ? createBreakableBox(scene, {
            name: `${unit.id}-breakable-${row}-${col}`,
            position: spawnPos,
            hitsRequired: 3,
          })
        : createCoverBox(scene, {
            name: `${unit.id}-cover-${row}-${col}`,
            position: spawnPos,
          });

      obstacle.setEnabled(true);
      meshes.push(obstacle);
    }
  }

  return {
    meshes,
    enemySpawns: [], // Se manejan en createPreCalculatedSpawns() según tu arquitectura
    centerPosition,
    nextPosition,
  };
}
