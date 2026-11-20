import type { Scene } from "@babylonjs/core/scene";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh"; // 🟢 Cambiado a Mesh
import type { EnemySpawn } from "./level-definition"; 
import { AssetRegistry } from "../assets/asset-registry";
// src/game/levels/unit-builder.types.ts
export type UnitKind =
  | "spawn_platform"
  | "parametric_path"
  | "parametric_tunnel"
  | "kamikaze_bridge"
  | "empty_tunnel"
  | "shooting_playground"
  | "empty_platform"
  | "finish_platform";

export interface PlatformUnitConfig {
  readonly width?: number; // Ancho opcional (por defecto 14m)
}

export interface UnitData {
  readonly id: string;
  readonly kind: UnitKind;
  readonly length: number;
  readonly distanceToEnable: number;
  readonly enabledDefault: boolean;
  readonly parametricConfig?: ParametricPathConfig;
  readonly tunnelConfig?: ParametricTunnelConfig;
  readonly playgroundConfig?: ShootingPlaygroundConfig;
  readonly platformConfig?: PlatformUnitConfig;
}

export interface ManagedUnitInstance {
  readonly id: string;
  readonly kind: UnitKind;
  readonly centerPosition: Vector3;
  readonly distanceToEnable: number;
  readonly enabledDefault: boolean;
  readonly meshes: Mesh[]; // 🟢 Cambiado a Mesh[]
  readonly enemySpawns: EnemySpawn[];
  isCurrentlyActive: boolean;
}

export interface BuilderResult {
  readonly centerPosition: Vector3;
  readonly meshes: Mesh[]; // 🟢 Cambiado a Mesh[]
  readonly enemySpawns: EnemySpawn[];
  readonly nextPosition: Vector3;
}

export interface UnitBuilderResult {
  readonly meshes: Mesh[];
  readonly enemySpawns: EnemySpawn[];
  readonly centerPosition: Vector3;
  readonly nextPosition: Vector3;
}

export type UnitBuilderFn = (
  scene: Scene,
  unit: UnitData,
  currentPosition: Vector3,
  forwardDirection: Vector3,
  registry: AssetRegistry
) => UnitBuilderResult;

export interface ParametricPathConfig {
  readonly unitBoxCount: number; // 🟢 Cantidad de cajas unitarias
  readonly straightSegments: number;   // Cantidad de bloques rectos
  readonly upSegments: number;         // Cantidad de bloques en subida (+Y)
  readonly downSegments: number;       // Cantidad de bloques en bajada (-Y)
  readonly curveRightSegments: number; // Cantidad de curvas hacia la derecha (+X)
  readonly curveLeftSegments: number;  // Cantidad de curvas hacia la izquierda (-X)
  readonly includeTunnel: boolean;
  readonly dodgeCount: number;
  readonly jumpCount: number;
  readonly breakableCount: number;
  readonly matrixWallGapCount?: number;       // Paredes 2x3 con 1 hueco libre al azar
  readonly matrixWallBreakableCount?: number;
  readonly breakableHitsRequired?: number; 
}

export interface ParametricTunnelConfig {
  readonly straightSegments: number;
  readonly upSegments: number;
  readonly downSegments: number;
  readonly curveRightSegments: number;
  readonly curveLeftSegments: number;

  /** Cantidad de paredes matriz 3x3 con 1 hueco libre */
  readonly matrixWallGapCount: number;
  /** Cantidad de paredes matriz 3x3 con 1 celda destruible */
  readonly matrixWallBreakableCount: number;
  /** Disparos necesarios para romper las celdas destruibles (por defecto 3) */
  readonly breakableHitsRequired?: number;
}
export interface ShootingPlaygroundConfig {
  readonly width: number;
  readonly groupingMin: number;         // Ej: 2
  readonly groupingMax: number;         // Ej: 5
  readonly breakablePercent: number;    // 0 a 1 (ej: 0.25 = 25% destruibles)
  readonly freeResultingSpace: number;  // 0 a 1 (ej: 0.70 = 70% de superficie caminable libre)
  readonly staticDroneCount: number;
  readonly seed?: number;               // Opcional para depuración determinista
}

export interface NavCell {
  readonly col: number;
  readonly row: number;
  readonly worldCenter: Vector3;
  readonly isWalkable: boolean;
}

export interface PlaygroundNavGrid {
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  readonly origin: Vector3;
  readonly cells: readonly NavCell[];
}

export interface UnitBuilderResult {
  readonly meshes: Mesh[];
  readonly enemySpawns: EnemySpawn[];
  readonly centerPosition: Vector3;
  readonly nextPosition: Vector3;
  readonly navGrid?: PlaygroundNavGrid; // Metadata espacial para NavMesh (Punto 5)
}

