// src/game/levels/level-builder.ts
import type { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { UnitKind, UnitBuilderFn, ManagedUnitInstance, UnitData } from "./unit-builder.types";
import { buildSpawnPlatform } from "./builders/spawn-platform.builder";
import { buildKamikazeBridge } from "./builders/kamikaze-bridge.builder";
import { buildEmptyTunnel } from "./builders/empty-tunnel.builder";
import { buildParametricPath } from "./builders/parametric-path.builder";
import { buildParametricTunnel } from "./builders/parametric-tunnel.builder";
import { buildShootingPlayground } from "./builders/shooting-playground.builder";

const UNIT_BUILDERS: Record<UnitKind, UnitBuilderFn> = {
  spawn_platform: buildSpawnPlatform,
  kamikaze_bridge: buildKamikazeBridge,
  empty_tunnel: buildEmptyTunnel, 
  parametric_path: buildParametricPath,
  parametric_tunnel: buildParametricTunnel,
  shooting_playground: buildShootingPlayground,
};

export function buildLevelUnits(scene: Scene, layout: UnitData[]): ManagedUnitInstance[] {
  const managedUnits: ManagedUnitInstance[] = [];
  let currentPosition = Vector3.Zero();
  const forwardDirection = new Vector3(0, 0, 1); // Desplazamiento lineal en eje +Z

  layout.forEach((unit) => {
    const builderFn = UNIT_BUILDERS[unit.kind];
    if (!builderFn) {
      console.error(`[LevelBuilder] No existe constructor para: ${unit.kind}`);
      return;
    }

    const result = builderFn(scene, unit, currentPosition, forwardDirection);

    // Babylon desactiva el render/física inicial si no está marcado por defecto
    //result.meshes.forEach(mesh => mesh.setEnabled(unit.enabledDefault));

    managedUnits.push({
      id: unit.id,
      kind: unit.kind,
      centerPosition: result.centerPosition,
      distanceToEnable: unit.distanceToEnable,
      enabledDefault: unit.enabledDefault,
      meshes: result.meshes,
      enemySpawns: result.enemySpawns,
      isCurrentlyActive: unit.enabledDefault
    });

    currentPosition = result.nextPosition;
  });

  return managedUnits;
}
