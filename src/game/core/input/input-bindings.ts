import type { InputAction } from "./input-actions";

/** Qué teclas (`KeyboardEvent.code`) disparan cada acción. */
export type KeyBindings = Readonly<Record<InputAction, readonly string[]>>;

/** Mapeo actual del juego. Es el único lugar donde se cambia una tecla. */
export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  moveForward: ["KeyW"],
  moveBackward: ["KeyS"],
  turnLeft: ["KeyA"],
  turnRight: ["KeyD"],
  cruise: ["ShiftLeft", "ShiftRight"],
  jump: ["Space"],
  crouch: ["Period"],
  shoot: ["Comma"],
  shield: ["Slash"],
  equip: ["KeyL"], // el personaje lo toma al SOLTAR la tecla
  pause: ["Escape", "KeyP"],
};