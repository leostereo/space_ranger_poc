type InputListener = () => void;

/**
 * Servicio global para "press any key": notifica la próxima entrada del jugador
 * (tecla o toque/click). Es de un solo uso por suscripción.
 *
 * No es un controller: no maneja entidades. El input del personaje va aparte.
 */
export class AnyInputService {
  private readonly pending = new Set<InputListener>();

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return; // mantener apretada una tecla no cuenta
    }
    // Ignora modificadores y atajos (ej: el atajo del Inspector Shift+Ctrl+Alt+I)
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    if (event.key === "Shift" || event.key === "Control" || event.key === "Alt" || event.key === "Meta") {
      return;
    }
    this.flush();
  };

  private readonly handlePointerDown = (): void => {
    this.flush();
  };

  constructor(private readonly target: Window = window) {
    this.target.addEventListener("keydown", this.handleKeyDown);
    this.target.addEventListener("pointerdown", this.handlePointerDown);
  }

  /** Ejecuta `listener` en la próxima entrada. Devuelve la función para cancelar. */
  onNextInput(listener: InputListener): () => void {
    this.pending.add(listener);
    return () => {
      this.pending.delete(listener);
    };
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.handleKeyDown);
    this.target.removeEventListener("pointerdown", this.handlePointerDown);
    this.pending.clear();
  }

  private flush(): void {
    // Snapshot + clear: lo que se suscriba durante el flush (ej: el estado siguiente)
    // espera a una entrada NUEVA, así una misma pulsación no encadena transiciones.
    const listeners = [...this.pending];
    this.pending.clear();
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        console.error("[AnyInputService] listener failed", error);
      }
    }
  }
}
