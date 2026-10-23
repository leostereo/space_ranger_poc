import { gameConfig } from "../../config/game-config";

export const CHARACTER_MASS = 70;
export const CHARACTER_CAPSULE_HEIGHT = gameConfig.player.height;
export const CHARACTER_CAPSULE_RADIUS = 0.15;
/** Fracción de la altura total que queda al agacharse. */
export const CHARACTER_CROUCH_HEIGHT_FACTOR = 0.5;

// Puntos de los centros de los casquetes (la altura total suma un radio arriba y otro abajo).
const HALF_SEGMENT = CHARACTER_CAPSULE_HEIGHT / 2 - CHARACTER_CAPSULE_RADIUS;
export const CHARACTER_CAPSULE_BOTTOM_POINT = -HALF_SEGMENT;
export const CHARACTER_CAPSULE_STANDING_TOP_POINT = HALF_SEGMENT;
// Los pies quedan fijos (BOTTOM); solo baja el techo. Con 0.8 → total 0.4, segmento 0.1.
export const CHARACTER_CAPSULE_CROUCH_TOP_POINT =
  CHARACTER_CAPSULE_BOTTOM_POINT +
  Math.max(0, CHARACTER_CAPSULE_HEIGHT * CHARACTER_CROUCH_HEIGHT_FACTOR - 2 * CHARACTER_CAPSULE_RADIUS);