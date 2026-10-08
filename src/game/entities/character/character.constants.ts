import { gameConfig } from "../../config/game-config";

/** Valores del Character usados por más de una clase. El resto vive como constante en cada clase. */
export const CHARACTER_MASS = 70;
/** Sale del modelo normalizado por el AssetLoader: cápsula y modelo tienen que medir lo mismo. */
export const CHARACTER_CAPSULE_HEIGHT = gameConfig.player.height;
export const CHARACTER_CAPSULE_RADIUS = 0.4;
export const CHARACTER_CAPSULE_BOTTOM_POINT = -0.5;
export const CHARACTER_CAPSULE_STANDING_TOP_POINT = 0.5;