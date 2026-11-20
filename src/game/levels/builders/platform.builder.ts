import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

import type { AssetRegistry } from "../../assets/asset-registry";
import type { UnitData, UnitBuilderResult } from "../unit-builder.types";

const PLATFORM_THICKNESS = 0.4;
const DEFAULT_PLATFORM_WIDTH = 14;

const SPAWN_EDGE_COLOR = new Color4(0.22, 0.74, 0.97, 0.95);  // Celeste eléctrico brillante (Inicio)
const EMPTY_EDGE_COLOR = new Color4(0.22, 0.74, 0.97, 0.55);  // Celeste estándar
const FINISH_EDGE_COLOR = new Color4(0.06, 0.73, 0.51, 0.95); // Verde esmeralda para la meta

function buildBasePlatform(
  scene: Scene,
  unit: UnitData,
  currentPosition: Vector3,
  forwardDirection: Vector3,
  registry: AssetRegistry,
  edgeColor: Color4,
  suffix: string
): UnitBuilderResult {
  const width = unit.platformConfig?.width ?? DEFAULT_PLATFORM_WIDTH;
  const centerPosition = currentPosition.add(forwardDirection.scale(unit.length * 0.5));
  const nextPosition = currentPosition.add(forwardDirection.scale(unit.length));

  const mesh: Mesh = CreateBox(
    `${unit.id}-${suffix}`,
    {
      width,
      height: PLATFORM_THICKNESS,
      depth: unit.length,
    },
    scene
  );

  // Cara superior alineada exactamente a currentPosition.y
  mesh.position.set(
    centerPosition.x,
    currentPosition.y - PLATFORM_THICKNESS * 0.5,
    centerPosition.z
  );

  mesh.material = registry.getMaterial("arena-floor");
  mesh.checkCollisions = true;
  mesh.isPickable = true;

  mesh.enableEdgesRendering();
  mesh.edgesWidth = 2.5;
  mesh.edgesColor = edgeColor;

  return {
    meshes: [mesh],
    enemySpawns: [],
    centerPosition,
    nextPosition,
  };
}

export function buildSpawnPlatform(
    scene: Scene,
    unit: UnitData,
    currentPosition: Vector3,
    forwardDirection: Vector3,
    registry: AssetRegistry
): UnitBuilderResult {
    return buildBasePlatform(
        scene,
        unit,
        currentPosition,
        forwardDirection,
        registry,
        SPAWN_EDGE_COLOR,
        "spawn-platform"
    );
}

export function buildEmptyPlatform(
  scene: Scene,
  unit: UnitData,
  currentPosition: Vector3,
  forwardDirection: Vector3,
  registry: AssetRegistry
): UnitBuilderResult {
  return buildBasePlatform(
    scene,
    unit,
    currentPosition,
    forwardDirection,
    registry,
    EMPTY_EDGE_COLOR,
    "empty-platform"
  );
}

export function buildFinishPlatform(
  scene: Scene,
  unit: UnitData,
  currentPosition: Vector3,
  forwardDirection: Vector3,
  registry: AssetRegistry
): UnitBuilderResult {
  return buildBasePlatform(
    scene,
    unit,
    currentPosition,
    forwardDirection,
    registry,
    FINISH_EDGE_COLOR,
    "finish-platform"
  );
}
