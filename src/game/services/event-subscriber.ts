import { EventManager, type GameEventHandler, type GameEventName, type Unsubscribe } from "./event-manager";

/**
 * Base abstracta para todo lo que escuche eventos.
 * Obliga a implementar registerEvents() y centraliza la desuscripción.
 */
export abstract class EventSubscriber {
  private _unsubscribers: Unsubscribe[] = [];
  private _eventsRegistered = false;

  /** Obligatorio: la subclase declara acá sus suscripciones usando this.listen(...). */
  protected abstract registerEvents(): void;

  protected listen<K extends GameEventName>(event: K, handler: GameEventHandler<K>): void {
    this._unsubscribers.push(EventManager.on(event, handler));
  }

  /** Llamar una sola vez desde build(). Es idempotente. */
  public subscribeEvents(): void {
    if (this._eventsRegistered) return;
    this._eventsRegistered = true;
    this.registerEvents();
  }

  /** Llamar desde dispose(). */
  public unsubscribeEvents(): void {
    this._unsubscribers.forEach((unsubscribe) => unsubscribe());
    this._unsubscribers = [];
    this._eventsRegistered = false;
  }
}