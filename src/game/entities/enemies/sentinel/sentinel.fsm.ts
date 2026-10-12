export type SentinelState = "Patrol";

export interface SentinelFsmDeps {
  /** Entrar a Patrol: elegir un destino nuevo y empezar a ir. */
  onEnterPatrol: () => void;
  /** ¿Terminó el viaje actual (giro, traslado y pausa)? */
  hasFinishedTrip: () => boolean;
}

type Guard = () => boolean;

/** FSM del sentinel. Hoy un solo estado; los próximos (ej: atacar, huir) se suman acá. */
export class SentinelFsm {
  private state: SentinelState = "Patrol";
  private readonly transitions: Record<SentinelState, Partial<Record<SentinelState, Guard>>>;
  private readonly onEnter: Record<SentinelState, () => void>;
  private readonly listeners = new Set<(state: SentinelState) => void>();

  constructor(deps: SentinelFsmDeps) {
    this.transitions = {
      // Patrol -> Patrol: al terminar un viaje se vuelve a entrar para sortear el siguiente destino.
      Patrol: { Patrol: deps.hasFinishedTrip },
    };
    this.onEnter = { Patrol: deps.onEnterPatrol };
  }

  /** Entra al estado inicial. */
  start(): void {
    this.onEnter[this.state]();
  }

  tick(): void {
    const guards = this.transitions[this.state];
    for (const next of Object.keys(guards) as SentinelState[]) {
      if (guards[next]?.()) {
        this.setState(next);
        return;
      }
    }
  }

  getState(): SentinelState {
    return this.state;
  }

  onStateChange(listener: (state: SentinelState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.listeners.clear();
  }

  private setState(next: SentinelState): void {
    this.state = next;
    this.onEnter[next]();
    this.listeners.forEach((listener) => listener(next));
  }
}