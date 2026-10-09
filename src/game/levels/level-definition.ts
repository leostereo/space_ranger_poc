import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import type { LevelScope } from "./level-scope";

/** Tipos de enemigo que un nivel puede pedir. */
export type EnemyType = "drone" | "dummyTarget";

/** Posiciones de aparición por categoría de enemigo. Cada posición es la base del enemigo (a ras de suelo). */
export type EnemySpawns = Partial<Record<EnemyType, readonly Vector3[]>>;
export interface WaveDefinition {
  /** Número de oleada (1, 2, 3...). */
  readonly wave: number;
  readonly enemyType: EnemyType;
  readonly quantity: number;
  /** Segundos desde el inicio de la oleada hasta que aparecen. */
  readonly delaySeconds: number;
}

export interface LevelSpawns {
  readonly character: Vector3;
  readonly enemies: EnemySpawns;
  readonly items: readonly Vector3[];
  readonly other: readonly Vector3[];
}

/** Datos para pathfinding terrestre. Los enemigos voladores no lo necesitan. */
export interface LevelNavigation {
  readonly navmeshFile?: string;
  readonly waypoints?: readonly Vector3[];
}

/** Cómo se reconoce una malla del GLB del mapa: por fragmento del nombre o por expresión regular. */
export type MapMeshMatcher = { readonly includes: string } | { readonly pattern: RegExp };

export type MapMeshRole = "buildings" | "trees" | "roads" | "greenAreas" | "waterways";

/** Un grupo de mallas del mapa que se fusiona en una sola (menos draw calls). */
export interface MapMeshGroup {
  readonly role: MapMeshRole;
  /** Nombre con el que queda la malla fusionada. */
  readonly name: string;
  readonly match: MapMeshMatcher;
  readonly allow32BitIndices: boolean;
}

export interface GlbMapSource {
  readonly kind: "glb";
  readonly modelRootUrl: string;
  readonly modelFile: string;
  /** Se aplica ANTES de fusionar, para que las mallas calculen bien sus coordenadas. */
  readonly rootPosition: Vector3;
  readonly rootRotationXDeg: number;
  readonly groups: readonly MapMeshGroup[];
  /** El suelo no se fusiona: queda como malla independiente (lo usa el hoverboard). */
  readonly ground: { readonly name: string; readonly match: MapMeshMatcher };
}

export interface ProceduralMapContext {
  readonly scene: Scene;
  /** Para registrar lo que no sea una malla (cuerpos de física, observers, etc.). */
  readonly scope: LevelScope;
}

export interface ProceduralMapResult {
  /** Suelo del nivel, si esta fuente aporta uno. */
  readonly ground?: Mesh;
  /** Resto de las mallas creadas. */
  readonly meshes?: readonly Mesh[];
}

/** Mapa creado por código con primitivas de Babylon. Las mallas que devuelve las adopta el LevelScope. */
export interface ProceduralMapSource {
  readonly kind: "procedural";
  readonly build: (context: ProceduralMapContext) => ProceduralMapResult;
}

export type LevelMapSource = GlbMapSource | ProceduralMapSource;

/** Datos ESTÁTICOS de un nivel: viven en el código y se versionan con él. */
export interface LevelDefinition {
  readonly id: string;
  /** Orden secuencial: el nivel pendiente de menor `order` es el siguiente. */
  readonly order: number;
  /** Objetivo del nivel (se muestra en la pausa). */
  readonly brief: string;
  readonly maps: readonly LevelMapSource[];
  readonly spawns: LevelSpawns;
  readonly waves: readonly WaveDefinition[];
  readonly navigation?: LevelNavigation;
}
