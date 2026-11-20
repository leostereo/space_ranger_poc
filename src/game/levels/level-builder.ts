import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AssetRegistry } from "../assets/asset-registry"; // Ajustar ruta según tu estructura
import type {
  UnitData,
  UnitKind,
  UnitBuilderFn,
  ManagedUnitInstance,
} from "./unit-builder.types";

// Importación de tus builders existentes + el nuevo
import { buildSpawnPlatform } from "./builders/spawn-platform.builder";
import { buildParametricPath } from "./builders/parametric-path.builder";
import { buildParametricTunnel } from "./builders/parametric-tunnel.builder";
import { buildKamikazeBridge } from "./builders/kamikaze-bridge.builder";
import { buildEmptyTunnel } from "./builders/empty-tunnel.builder";
import { buildShootingPlayground } from "./builders/shooting-playground.builder";
import { buildEmptyPlatform, buildFinishPlatform } from "./builders/platform.builder";

const UNIT_BUILDERS: Record<UnitKind, UnitBuilderFn> = {
  spawn_platform: buildSpawnPlatform,
  parametric_path: buildParametricPath,
  parametric_tunnel: buildParametricTunnel,
  kamikaze_bridge: buildKamikazeBridge,
  empty_tunnel: buildEmptyTunnel,
  shooting_playground: buildShootingPlayground,
  empty_platform: buildEmptyPlatform,
  finish_platform: buildFinishPlatform,
};

export function buildLevelUnits(
  scene: Scene,
  layout: readonly UnitData[],
  registry: AssetRegistry
): ManagedUnitInstance[] {
  const managedUnits: ManagedUnitInstance[] = [];
  let currentPosition = Vector3.Zero();
  const forwardDirection = new Vector3(0, 0, 1);

  for (const unit of layout) {
    const builder = UNIT_BUILDERS[unit.kind];

    if (!builder) {
      throw new Error(
        `[LevelBuilder] No se encontró un builder registrado para el tipo de unidad: "${unit.kind}" (id: "${unit.id}")`
      );
    }

    // Ejecutamos el builder pasando scene y registry
    const result = builder(
      scene,
      unit,
      currentPosition,
      forwardDirection,
      registry
    );

    // Regla crítica de Havok: garantizar que todas las mallas nazcan habilitadas
    // para que createGroundPhysics registre sus cuerpos físicos correctamente.
    for (const mesh of result.meshes) {
      mesh.setEnabled(true);
    }

    managedUnits.push({
      id: unit.id,
      kind: unit.kind,
      distanceToEnable: unit.distanceToEnable,
      enabledDefault: unit.enabledDefault,
      isCurrentlyActive: true, // Havok nace activo; EntitiesController lo ajusta en Frame 0
      centerPosition: result.centerPosition,
      meshes: result.meshes,
      enemySpawns: result.enemySpawns,
    });

    // Avanzamos el cursor al punto final de la unidad recién construida
    currentPosition = result.nextPosition;
  }

  return managedUnits;
}
