import type { InputAction } from "./input-actions";
import type { ActionFrame, InputDevice, InputSource } from "./input-source";

/**
 * Reúne las fuentes de entrada y le da al juego un único estado por frame: qué acciones están sostenidas,
 * cuáles se presionaron y cuáles se soltaron. Quien consulta no sabe si vino de un teclado o de un gamepad.
 * `update()` se llama una vez por frame, antes de que corra el resto del juego.
 */
export class InputHub {
  private readonly frame: ActionFrame = { held: new Set(), pressed: new Set() };
  private readonly previousHeld = new Set<InputAction>();
  private readonly released = new Set<InputAction>();
  private readonly pressedListeners = new Map<InputAction, Set<() => void>>();
  private lastDevice: InputDevice = "keyboard";

  constructor(private readonly sources: readonly InputSource[]) {}

  /** Último dispositivo con el que se presionó algo (para mostrar la ayuda correcta). */
  get lastUsedDevice(): InputDevice {
    return this.lastDevice;
  }

  isHeld(action: InputAction): boolean {
    return this.frame.held.has(action);
  }

  /** Verdadero solo durante el frame en que se presionó. */
  wasPressed(action: InputAction): boolean {
    return this.frame.pressed.has(action);
  }

  /** Verdadero solo durante el frame en que se soltó. */
  wasReleased(action: InputAction): boolean {
    return this.released.has(action);
  }

  /** Para lo discreto (pausa, menús): se avisa dentro de `update()` cuando la acción se presiona. */
  onPressed(action: InputAction, listener: () => void): () => void {
    const listeners = this.pressedListeners.get(action) ?? new Set<() => void>();
    listeners.add(listener);
    this.pressedListeners.set(action, listeners);
    return () => listeners.delete(listener);
  }

  update(): void {
    this.previousHeld.clear();
    this.frame.held.forEach((action) => this.previousHeld.add(action));
    this.frame.held.clear();
    this.frame.pressed.clear();
    this.released.clear();

    for (const source of this.sources) {
      const pressedBefore = this.frame.pressed.size;
      source.poll(this.frame);
      if (this.frame.pressed.size > pressedBefore) {
        this.lastDevice = source.device;
      }
    }

    this.previousHeld.forEach((action) => {
      if (!this.frame.held.has(action)) {
        this.released.add(action);
      }
    });

    this.frame.pressed.forEach((action) => {
      const listeners = this.pressedListeners.get(action);
      if (listeners) {
        [...listeners].forEach((listener) => listener()); // copia: un listener puede desuscribirse al ejecutarse
      }
    });
  }

  dispose(): void {
    this.sources.forEach((source) => source.dispose());
    this.pressedListeners.clear();
    this.frame.held.clear();
    this.frame.pressed.clear();
  }
}