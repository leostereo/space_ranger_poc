import type { InputAction } from "./input-actions";
import type { KeyBindings } from "./input-bindings";
import type { ActionFrame, InputSource } from "./input-source";

/** Teclado: escucha los eventos de la ventana y los traduce a acciones según los bindings. */
export class KeyboardSource implements InputSource {
  readonly device = "keyboard" as const;

  private readonly actionsByCode = new Map<string, InputAction[]>();
  private readonly down = new Set<string>();
  /** Teclas presionadas desde la última lectura (para no perder un toque más corto que un frame). */
  private readonly tapped = new Set<string>();

  constructor(bindings: KeyBindings) {
    for (const [action, codes] of Object.entries(bindings) as [InputAction, readonly string[]][]) {
      for (const code of codes) {
        const actions = this.actionsByCode.get(code) ?? [];
        actions.push(action);
        this.actionsByCode.set(code, actions);
      }
    }
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  poll(frame: ActionFrame): void {
    for (const code of this.down) {
      this.actionsByCode.get(code)?.forEach((action) => frame.held.add(action));
    }
    for (const code of this.tapped) {
      this.actionsByCode.get(code)?.forEach((action) => {
        frame.held.add(action); // un toque corto también cuenta como sostenido durante ese frame
        frame.pressed.add(action);
      });
    }
    this.tapped.clear();
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.down.clear();
    this.tapped.clear();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.actionsByCode.has(event.code) || this.down.has(event.code)) {
      return; // no es una tecla del juego, o es la repetición automática de una ya presionada
    }
    this.down.add(event.code);
    this.tapped.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.down.delete(event.code);
  };

  /** Al perder el foco no llegan los keyup: se suelta todo para que no queden teclas pegadas. */
  private readonly onBlur = (): void => {
    this.down.clear();
    this.tapped.clear();
  };
}