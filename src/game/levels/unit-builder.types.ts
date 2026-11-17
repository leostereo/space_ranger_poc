import type { Scene } from "@babylonjs/core/scene";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh"; // 🟢 Cambiado a Mesh
import type { EnemySpawn } from "./level-definition"; 
// src/game/levels/unit-builder.types.ts
export type UnitKind =
  | "spawn_platform"
  | "kamikaze_bridge"
  | "empty_tunnel"
  | "parametric_path"
  | "parametric_tunnel"
  | "shooting_playground";

export interface UnitData {
  readonly id: string;
  readonly kind: UnitKind;
  readonly length: number;              // En el túnel paramétrico, actuará como multiplicador base o largo estimado
  readonly distanceToEnable: number;
  readonly enabledDefault: boolean;
  readonly parametricConfig?: ParametricPathConfig;
  readonly tunnelConfig?: ParametricTunnelConfig;
  readonly playgroundConfig?: ShootingPlaygroundConfig;
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

// Firma común para todas las funciones constructoras
export type UnitBuilderFn = (
  scene: Scene,
  unit: UnitData,
  currentPosition: Vector3,
  forwardDirection: Vector3
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
  readonly width: number;               // Ej: 30
  readonly coverRows: number;           // Ej: 3 filas de avance
  readonly coversPerRow: number;        // Ej: 4 bloques por fila
  readonly breakableRatio?: number;     // 0 a 1 (ej: 0.3 para que 30% sean destruibles)
  readonly staticDroneCount: number;    // Ej: 4 drones al fondo
  readonly dummyTargetCount?: number;   // Opcional: blancos estáticos
}

