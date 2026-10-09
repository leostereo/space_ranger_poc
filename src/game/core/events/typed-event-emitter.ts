type Listener<TPayload> = (payload: TPayload) => void;

/**
 * Emisor de eventos tipado por mapa de eventos (nombre -> payload).
 * No depende de Babylon ni del DOM. Un listener que lanza no rompe a los demás.
 */
export class TypedEventEmitter<TEventMap extends object> {
  private readonly listeners: { [K in keyof TEventMap]?: Set<Listener<TEventMap[K]>> } = {};

  /** Suscribe un listener. Devuelve la función para desuscribirlo. */
  on<K extends keyof TEventMap>(event: K, listener: Listener<TEventMap[K]>): () => void {
    const set = (this.listeners[event] ??= new Set());
    set.add(listener);
    return () => this.off(event, listener);
  }

  off<K extends keyof TEventMap>(event: K, listener: Listener<TEventMap[K]>): void {
    this.listeners[event]?.delete(listener);
  }

  emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void {
    const set = this.listeners[event];
    if (!set) {
      return;
    }
    for (const listener of [...set]) {
      try {
        listener(payload);
      } catch (error) {
        console.error(`[TypedEventEmitter] listener failed for "${String(event)}"`, error);
      }
    }
  }

  /** Quita todos los listeners (usar en dispose del dueño del emisor). */
  clear(): void {
    for (const key of Object.keys(this.listeners) as (keyof TEventMap)[]) {
      delete this.listeners[key];
    }
  }
}
