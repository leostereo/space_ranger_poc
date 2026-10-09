import type { Vector3 } from "@babylonjs/core/Maths/math.vector";

/** Nombres de eventos centralizados: nada de strings sueltos por el código. */
export const GameEvents = {
  PlayerShooted: "player_shooted",
  PlayerDamaged: "player_damaged",
  PlayerDied: "player_died",
} as const;

export interface PlayerShootedPayload {
  damage: number;
  hitPoint: Vector3;
  direction: Vector3;
  sourceId?: string;
}

export interface PlayerDamagedPayload {
  livesLeft: number;
}

/** Mapa evento -> payload. Para sumar un evento nuevo: una entrada acá y otra en GameEvents. */
export interface GameEventMap {
  [GameEvents.PlayerShooted]: PlayerShootedPayload;
  [GameEvents.PlayerDamaged]: PlayerDamagedPayload;
  [GameEvents.PlayerDied]: Record<string, never>;
}

export type GameEventName = keyof GameEventMap;
export type GameEventHandler<K extends GameEventName> = (payload: GameEventMap[K]) => void;
export type Unsubscribe = () => void;

export class EventManager {
  private static readonly _handlers = new Map<GameEventName, Set<GameEventHandler<any>>>();

  private constructor() {}

  /** Suscribe un handler. Devuelve la función para desuscribirse. */
  static on<K extends GameEventName>(event: K, handler: GameEventHandler<K>): Unsubscribe {
    let set = this._handlers.get(event);
    if (!set) {
      set = new Set();
      this._handlers.set(event, set);
    }
    set.add(handler);
    return () => this.off(event, handler);
  }

  static once<K extends GameEventName>(event: K, handler: GameEventHandler<K>): Unsubscribe {
    const unsubscribe = this.on(event, (payload) => {
      unsubscribe();
      handler(payload);
    });
    return unsubscribe;
  }

  static off<K extends GameEventName>(event: K, handler: GameEventHandler<K>): void {
    const set = this._handlers.get(event);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this._handlers.delete(event);
  }

  static emit<K extends GameEventName>(event: K, payload: GameEventMap[K]): void {
    const set = this._handlers.get(event);
    if (!set) return;

    // Copia: un handler puede desuscribirse (o suscribir otro) mientras se emite.
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`EventManager: error en handler de "${event}"`, error);
      }
    }
  }

  /** Limpia todo. Se usa al descartar un POC para no dejar handlers colgados. */
  static clear(): void {
    this._handlers.clear();
  }
}