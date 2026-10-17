import type { InputAction } from "./input-actions";

/** Un control físico del mando: un botón, o un eje movido hacia un lado desde su posición de reposo. */
export type PadControl =
  | { readonly kind: "button"; readonly index: number }
  | { readonly kind: "axis"; readonly index: number; readonly direction: 1 | -1; readonly rest: number };

export type GamepadBindings = Partial<Record<InputAction, readonly PadControl[]>>;

const AXIS_ACTIVE_DELTA = 0.5; // cuánto hay que mover un eje desde su reposo para que cuente
const BUTTON_ACTIVE_VALUE = 0.5; // gatillos analógicos

const STICK_X_AXIS = 0;
const STICK_Y_AXIS = 1;
const STICK_REST = 0;

const button = (index: number): PadControl => ({ kind: "button", index });
const axis = (index: number, direction: 1 | -1): PadControl => ({ kind: "axis", index, direction, rest: STICK_REST });

/** Mapeo fijo del mando (USB Joystick genérico). Es el único lugar donde se cambia un botón. */
export const DEFAULT_GAMEPAD_BINDINGS: GamepadBindings = {
  moveForward: [axis(STICK_Y_AXIS, -1)], // arriba = −1
  moveBackward: [axis(STICK_Y_AXIS, 1)],
  turnLeft: [axis(STICK_X_AXIS, -1)],
  turnRight: [axis(STICK_X_AXIS, 1)],
  jump: [button(0)],
  shield: [button(1)],
  crouch: [button(2)],
  shoot: [button(3)],
  cruise: [button(4), button(6)],
  equip: [button(5), button(7)], // el personaje lo toma al SOLTAR, como la tecla L
  pause: [button(9)], // Start en este tipo de mando (supuesto)
};

export function isControlActive(control: PadControl, pad: Gamepad): boolean {
  if (control.kind === "button") {
    const padButton = pad.buttons[control.index];
    return !!padButton && (padButton.pressed || padButton.value > BUTTON_ACTIVE_VALUE);
  }
  const value = pad.axes[control.index];
  return value !== undefined && (value - control.rest) * control.direction > AXIS_ACTIVE_DELTA;
}