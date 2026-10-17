import { isControlActive, type GamepadBindings, type PadControl } from "./gamepad-bindings";
import type { InputAction } from "./input-actions";
import type { ActionFrame, InputSource } from "./input-source";

type Listener = () => void;

/**
 * Gamepad: lo consulta en cada frame (la API no emite eventos de botones) y traduce a acciones con el
 * mapeo fijo recibido. Usa el primer mando conectado.
 */
export class GamepadSource implements InputSource {
  readonly device = "gamepad" as const;

  private readonly bindingEntries: readonly (readonly [InputAction, readonly PadControl[]])[];
  private activePadId: string | null = null;
  private readonly currentHeld = new Set<InputAction>();
  private readonly previousHeld = new Set<InputAction>();
  private readonly previousButtons: boolean[] = [];
  private readonly pressedListeners = new Map<InputAction, Set<Listener>>();
  private readonly anyButtonListeners = new Set<Listener>();

  constructor(bindings: GamepadBindings) {
    this.bindingEntries = Object.entries(bindings) as [InputAction, readonly PadControl[]][];
    window.addEventListener("gamepadconnected", this.onConnected);
    window.addEventListener("gamepaddisconnected", this.onDisconnected);
  }

  /** Se avisa dentro del `update` del hub, cuando la acción se presiona en el mando. */
  onActionPressed(action: InputAction, listener: Listener): () => void {
    const listeners = this.pressedListeners.get(action) ?? new Set<Listener>();
    listeners.add(listener);
    this.pressedListeners.set(action, listeners);
    return () => listeners.delete(listener);
  }

  /** Cualquier botón del mando, aunque no tenga acción asignada ("press any key"). */
  onAnyButton(listener: Listener): () => void {
    this.anyButtonListeners.add(listener);
    return () => this.anyButtonListeners.delete(listener);
  }

  poll(frame: ActionFrame): void {
    const pad = this.findPad();
    if (!pad) {
      this.resetState();
      return;
    }

    if (this.updateButtons(pad)) {
      this.anyButtonListeners.forEach((listener) => listener());
    }

    this.currentHeld.clear();
    for (const [action, controls] of this.bindingEntries) {
      if (controls.some((control) => isControlActive(control, pad))) {
        this.currentHeld.add(action);
      }
    }

    for (const action of this.currentHeld) {
      frame.held.add(action);
      if (!this.previousHeld.has(action)) {
        frame.pressed.add(action);
        this.pressedListeners.get(action)?.forEach((listener) => listener());
      }
    }
    this.previousHeld.clear();
    this.currentHeld.forEach((action) => this.previousHeld.add(action));
  }

  dispose(): void {
    window.removeEventListener("gamepadconnected", this.onConnected);
    window.removeEventListener("gamepaddisconnected", this.onDisconnected);
    this.pressedListeners.clear();
    this.anyButtonListeners.clear();
    this.resetState();
  }

  /** El primer mando conectado; si es otro distinto del anterior, se reinicia el estado. */
  private findPad(): Gamepad | null {
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (pad?.connected) {
        if (this.activePadId !== pad.id) {
          this.activePadId = pad.id;
          this.resetState();
        }
        return pad;
      }
    }
    return null;
  }

  /** Actualiza el estado de los botones y dice si alguno se acaba de presionar. */
  private updateButtons(pad: Gamepad): boolean {
    let pressedNow = false;
    pad.buttons.forEach((padButton, index) => {
      if (padButton.pressed && !this.previousButtons[index]) {
        pressedNow = true;
      }
      this.previousButtons[index] = padButton.pressed;
    });
    return pressedNow;
  }

  private resetState(): void {
    this.currentHeld.clear();
    this.previousHeld.clear();
    this.previousButtons.length = 0;
  }

  private readonly onConnected = (event: GamepadEvent): void => {
    if (import.meta.env.DEV) {
      const { id, mapping, buttons, axes } = event.gamepad;
      console.info(`[gamepad] connected: ${id} (mapping: "${mapping}", ${buttons.length} buttons, ${axes.length} axes)`);
    }
  };

  private readonly onDisconnected = (event: GamepadEvent): void => {
    if (event.gamepad.id === this.activePadId) {
      this.activePadId = null;
      this.resetState();
    }
  };
}