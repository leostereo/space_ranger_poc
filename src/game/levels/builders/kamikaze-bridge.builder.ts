import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh"; // Importante para corregir el tipo
import { createBoxPath } from "../procedural/box-path-builder"; // Tus paths existentes
import { createBridgeMaterials } from "../procedural/level-material-builder"; // 🟢 Nuestro nuevo import
import type { UnitBuilderFn } from "../unit-builder.types";

const SENTINELS_PER_BRIDGE = 10;
const DRONE_HOVER_HEIGHT = 4;

export const buildKamikazeBridge: UnitBuilderFn = (scene, unit, currentPosition, forwardDirection) => {
  const halfLengthVector = forwardDirection.scale(unit.length / 2);
  const centerPosition = currentPosition.add(halfLengthVector);

  const unitMeshes: Mesh[] = []; // 🟢 Aseguramos que sea estrictamente Mesh[]
  const unitEnemies: any[] = [];

  const count = Math.ceil(unit.length / 0.5);
  const bridgePoints: Vector3[] = [];
  for (let i = 0; i <= count; i++) {
    const progress = (i / count) * unit.length;
    bridgePoints.push(currentPosition.add(forwardDirection.scale(progress)));
  }

  // 🟢 1. Generamos el lote de materiales tipados requeridos usando la nueva función
  const bridgeMaterials = createBridgeMaterials(scene, unit.id);

  // 🟢 2. Pasamos el lote de materiales obligatorios de forma nativa
  const boxPath = createBoxPath(
    scene,
    unit.id,
    bridgePoints,
    bridgeMaterials, // <-- Objeto BoxPathMaterials estricto y corregido
    {
      halfWidth: 5,
      thickness: 0.4,
      segmentLength: 3,
      railHeight: 1.5,
      railThickness: 0.3,
      classify: () => undefined // Común por defecto para la prueba del Nivel 8
    }
  );

  // Llenamos el lote convirtiendo explícitamente a Mesh para satisfacer el compilador
  boxPath.planks.forEach(p => unitMeshes.push(p.mesh as Mesh));
  boxPath.rails.forEach(r => unitMeshes.push(r as Mesh));

  // Inyección e indexación de los 10 drones kamikaze adjuntos a este puente
  for (let i = 0; i < SENTINELS_PER_BRIDGE; i++) {
    const fraction = (i + 1) / (SENTINELS_PER_BRIDGE + 1);
    const lateralPositions = [-3, 0, 3];
    const lateralOffset = lateralPositions[i % lateralPositions.length];

    const enemyPoint = currentPosition.add(forwardDirection.scale(unit.length * fraction));
    enemyPoint.x += lateralOffset;

    unitEnemies.push({
      position: enemyPoint.add(new Vector3(0, DRONE_HOVER_HEIGHT, 0)),
      forward: forwardDirection.scale(-1),
      patrol: {
        volume: {
          kind: "box",
          center: enemyPoint.add(new Vector3(0, DRONE_HOVER_HEIGHT + 2, 0)),
          size: new Vector3(8, 4, 10)
        }
      }
    });
  }

  return {
    centerPosition,
    meshes: unitMeshes, // Devuelve Mesh[] perfectamente compatible
    enemySpawns: unitEnemies,
    nextPosition: currentPosition.add(forwardDirection.scale(unit.length))
  };
};
