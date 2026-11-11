// src/game/levels/procedural/obstacle-builder.ts
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

// Constantes métricas compartidas en todo el juego
export const PLAYER_HEIGHT = 0.8;
export const UNIT = PLAYER_HEIGHT / 2; // 0.4m (altura del personaje agachado)

export type ObstacleKind = "jump" | "pillar" | "wall" | "breakable" | "cover";

const OBSTACLE_COLORS: Record<ObstacleKind, Color3> = {
  jump: Color3.FromHexString("#27ae60"),      // Verde: se salta
  dodge: Color3.FromHexString("#8e44ad"),     // (Alias interno para pillar/wall)
  pillar: Color3.FromHexString("#8e44ad"),    // Violeta: se esquiva
  wall: Color3.FromHexString("#8e44ad"),      // Violeta: pared lateral
  breakable: Color3.FromHexString("#c0392b"), // Rojo: destruible
  cover: Color3.FromHexString("#7f8c8d"),     // Gris: cobertura táctica
} as Record<ObstacleKind, Color3>;

export interface ObstacleOptions {
  readonly name: string;
  readonly position: Vector3; // Punto exacto en el piso donde se apoya el obstáculo
  readonly headingY?: number; // Rotación en radianes (por defecto 0)
  readonly widthUnits?: number;
  readonly depthUnits?: number;
}

const getObstacleMaterial = (scene: Scene, kind: ObstacleKind): StandardMaterial => {
  const matName = `shared-obstacle-mat-${kind}`;
  const existing = scene.getMaterialByName(matName) as StandardMaterial;
  if (existing) return existing;

  const color = OBSTACLE_COLORS[kind];
  const mat = new StandardMaterial(matName, scene);
  mat.diffuseColor = color;
  mat.emissiveColor = color.scale(0.25);
  mat.specularColor = new Color3(0.1, 0.1, 0.1);
  return mat;
};

/** Función base genérica que apoya la caja exactamente sobre el suelo indicado en `position.y` */
const buildBaseBox = (
  scene: Scene,
  kind: ObstacleKind,
  opts: ObstacleOptions,
  size: Vector3
): Mesh => {
  const box = CreateBox(opts.name, { width: size.x, height: size.y, depth: size.z }, scene);
  // Elevamos size.y / 2 para que la base apoye justo en opts.position.y
  box.position.set(opts.position.x, opts.position.y + size.y / 2, opts.position.z);
  box.rotation.y = opts.headingY ?? 0;
  box.material = getObstacleMaterial(scene, kind);
  box.checkCollisions = true;
  return box;
};

// --- CONSTRUCTORES ESPECÍFICOS REUTILIZABLES ---

/** Bloque de cobertura táctica (ideal para shooting_playGround). Tapa al personaje. */
export const createCoverBox = (scene: Scene, opts: ObstacleOptions): Mesh => {
  const width = (opts.widthUnits ?? 8) * UNIT;
  const depth = (opts.depthUnits ?? 3) * UNIT;
  const height = 3 * UNIT; // 1.5 alturas de personaje
  return buildBaseBox(scene, "cover", opts, new Vector3(width, height, depth));
};

/** Pilar alto para esquivar o cubrirse lateralmente */
export const createDodgePillar = (scene: Scene, opts: ObstacleOptions): Mesh => {
  const width = (opts.widthUnits ?? 4) * UNIT;
  const depth = (opts.depthUnits ?? 4) * UNIT;
  const height = 4 * UNIT; // 2 alturas de personaje
  return buildBaseBox(scene, "pillar", opts, new Vector3(width, height, depth));
};

/** Caja destruible con disparos (mantiene el sufijo '-breakable' si tu sistema lo requiere) */
export const createBreakableBox = (scene: Scene, opts: ObstacleOptions): Mesh => {
  const width = (opts.widthUnits ?? 4) * UNIT;
  const depth = (opts.depthUnits ?? 4) * UNIT;
  const height = 3 * UNIT;
  return buildBaseBox(scene, "breakable", opts, new Vector3(width, height, depth));
};

/** Valla baja transversal para saltar */
export const createJumpBar = (scene: Scene, opts: ObstacleOptions & { trackWidth: number }): Mesh => {
  const height = 3 * UNIT;
  return buildBaseBox(scene, "jump", opts, new Vector3(opts.trackWidth - 1.5, height, 2));
};

/** Pared alta lateral para esquivar (Violeta) */
export const createDodgeWall = (scene: Scene, opts: ObstacleOptions): Mesh => {
  const width = (opts.widthUnits ?? 15) * UNIT;
  const depth = (opts.depthUnits ?? 5) * UNIT;
  const height = 4 * UNIT; // 2 alturas de personaje
  return buildBaseBox(scene, "wall", opts, new Vector3(width, height, depth));
};