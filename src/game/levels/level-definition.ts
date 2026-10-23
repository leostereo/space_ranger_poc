import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import type { PatrolRegion } from "../navigation/patrol-region";
import type { LevelScope } from "./level-scope";

/** Tipos de enemigo que un nivel puede pedir. */
export type EnemyType =
  | "drone"
  | "dummyTarget"
  | "staticDrone"
  | "sentinelDrone"
  | "flyingSentinel"
  | "raycastDummy"
  | "dummyKamikazeDrone";
/** Dónde y hacia dónde aparece un enemigo. */
export interface EnemySpawn {
  /** Base del enemigo: a ras de suelo (o de la plataforma donde se apoya). */
  readonly position: Vector3;
  /** Hacia dónde mira. Solo importa a los que apuntan; por defecto, +Z. */
  readonly forward?: Vector3;
  /** Segundos que espera antes del primer disparo (para desfasar enemigos que disparan a la vez). Por defecto, 0. */
  readonly fireDelaySeconds?: number;
  /** Región (volumen y/o plano) donde patrulla; solo la usan los enemigos que se mueven por puntos. */
  readonly patrol?: PatrolRegion;
}

/** Spawns por categoría de enemigo. */
export type EnemySpawns = Partial<Record<EnemyType, readonly EnemySpawn[]>>;
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

/** Forma del cuerpo físico estático: "box" sirve para planos; "mesh" sigue la geometría (curvas, relieve). */
export type StaticShape = "box" | "mesh";

/** Para qué se reserva un bloque sólido; lo usará la strategy del nivel (ej: destruirlo o hacerlo caer). */
export type SolidKind = "breakable" | "falling";

/** Malla que además de verse debe colisionar (cuerpo estático). */
export interface StaticSolid {
  readonly mesh: Mesh;
  readonly shape: StaticShape;
  /** Bloque especial; sin valor = bloque común. */
  readonly kind?: SolidKind;
}

export interface ProceduralMapResult {
  /** Suelo del nivel, si esta fuente aporta uno. */
  readonly ground?: Mesh;
  /** Forma del cuerpo físico del suelo. Por defecto "box". */
  readonly groundShape?: StaticShape;
  /** Resto de las mallas creadas (sin física). */
  readonly meshes?: readonly Mesh[];
  /** Mallas que no son suelo pero deben colisionar (paredes, túneles, etc.). */
  readonly solids?: readonly StaticSolid[];
}

/** Mapa creado por código con primitivas de Babylon. Las mallas que devuelve las adopta el LevelScope. */
export interface ProceduralMapSource {
  readonly kind: "procedural";
  readonly build: (context: ProceduralMapContext) => ProceduralMapResult;
}

export type LevelMapSource = GlbMapSource | ProceduralMapSource;

/** Skybox de un nivel: seis imágenes `<basePath>_px|nx|py|ny|pz|nz.<extension>`. */
export interface SkyboxDefinition {
  /** Ruta sin sufijo ni extensión, relativa a /public. Ej: "images/skybox/space". */
  readonly basePath: string;
  /** Por defecto "png". */
  readonly extension?: string;
  /** Lado del cubo. Por defecto 1000. */
  readonly size?: number;
  /** Para que el mismo set se vea distinto entre niveles. Por defecto 0. */
  readonly rotationYDeg?: number;
}

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
  readonly skybox?: SkyboxDefinition;

}
