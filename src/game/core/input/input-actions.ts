/** Acciones lógicas del juego: lo único que el resto del código conoce de la entrada. */
export const INPUT_ACTIONS = [
  "moveForward",
  "moveBackward",
  "turnLeft",
  "turnRight",
  "cruise",
  "jump",
  "crouch",
  "shoot",
  "shield",
  "equip",
  "pause",
] as const;

export type InputAction = (typeof INPUT_ACTIONS)[number];