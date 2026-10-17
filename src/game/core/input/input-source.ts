import type { InputAction } from "./input-actions";

export type InputDevice = "keyboard" | "gamepad";

/** Lo que las fuentes completan en cada frame. */
export interface ActionFrame {
  /** Acciones sostenidas ahora. */
  readonly held: Set<InputAction>;
  /** Acciones que se presionaron desde la lectura anterior (aunque ya se hayan soltado). */
  readonly pressed: Set<InputAction>;
}

/** Un dispositivo de entrada (teclado, gamepad) que sabe traducir lo suyo a acciones. */
export interface InputSource {
  readonly device: InputDevice;
  /** Suma a `frame` las acciones sostenidas y las presionadas desde la lectura anterior. */
  poll(frame: ActionFrame): void;
  dispose(): void;
}