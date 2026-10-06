import type { Vector3 } from "@babylonjs/core/Maths/math.vector";

/** Tipos de enemigo que un nivel puede pedir. */
export type EnemyType = "drone";

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
  readonly enemies: readonly Vector3[];
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

export interface MapDefinition {
  readonly modelRootUrl: string;
  readonly modelFile: string;
  /** Se aplica ANTES de fusionar, para que las mallas calculen bien sus coordenadas. */
  readonly rootPosition: Vector3;
  readonly rootRotationXDeg: number;
  readonly groups: readonly MapMeshGroup[];
  /** El suelo no se fusiona: queda como malla independiente (lo usa el hoverboard). */
  readonly ground: { readonly name: string; readonly match: MapMeshMatcher };
}

/** Datos ESTÁTICOS de un nivel: viven en el código y se versionan con él. */
export interface LevelDefinition {
  readonly id: string;
  /** Orden secuencial: el nivel pendiente de menor `order` es el siguiente. */
  readonly order: number;
  /** Objetivo del nivel (se muestra en la pausa). */
  readonly brief: string;
  readonly map: MapDefinition;
  readonly spawns: LevelSpawns;
  readonly waves: readonly WaveDefinition[];
  readonly navigation?: LevelNavigation;
}
