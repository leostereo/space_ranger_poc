type HotkeyListener = () => void;

/**
 * Atajos de teclado globales de la interfaz (pausa, depuración). Se identifican por
 * `KeyboardEvent.code` ("Escape", "KeyP"): no dependen del idioma del teclado.
 *
 * No es el input del personaje (eso va en los input controllers) ni "press any key"
 * (AnyInputService). Ignora teclas mantenidas y combinaciones con Ctrl/Alt/Meta.
 */
export class HotkeyService {
  private readonly bindings = new Map<string, Set<HotkeyListener>>();

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    const listeners = this.bindings.get(event.code);
    if (!listeners || listeners.size === 0) {
      return;
    }
    // Snapshot: lo que se suscriba durante la notificación (el estado siguiente) espera una pulsación NUEVA.
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        console.error(`[HotkeyService] listener failed for "${event.code}"`, error);
      }
    }
  };

  constructor(private readonly target: Window = window) {
    this.target.addEventListener("keydown", this.handleKeyDown);
  }

  /** Devuelve la función para desuscribir. */
  onHotkey(code: string, listener: HotkeyListener): () => void {
    const listeners = this.bindings.get(code) ?? new Set<HotkeyListener>();
    listeners.add(listener);
    this.bindings.set(code, listeners);
    return () => {
      listeners.delete(listener);
    };
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.handleKeyDown);
    this.bindings.clear();
  }
}
