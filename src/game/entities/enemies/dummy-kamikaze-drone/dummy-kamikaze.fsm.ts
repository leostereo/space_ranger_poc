export type DummyKamikazeState =
  | "Patrol"
  | "Spotting"
  | "Chasing"
  | "Charging"
  | "Returning"
  | "Exploding";

export interface DummyKamikazeFsmCallbacks {
  readonly onEnterPatrol: () => void;
  readonly onEnterSpotting: () => void;
  readonly onEnterChasing: () => void;
  readonly onEnterCharging: () => void;
  readonly onEnterReturning: () => void;
  readonly onEnterExploding: () => void;
}

/**
 * Controla el ciclo de vida de los estados del DummyKamikazeDrone.
 * Encapsula la cuenta regresiva del estado activo.
 */
export class DummyKamikazeFsm {
  private _state: DummyKamikazeState = "Patrol";
  private _stateTimer = 0;

  constructor(private readonly callbacks: DummyKamikazeFsmCallbacks) {}

  public get state(): DummyKamikazeState {
    return this._state;
  }

  public get stateTimer(): number {
    return this._stateTimer;
  }

  /** Posiciona la FSM en el estado de arranque. */
  public start(): void {
    this._state = "Patrol";
    this._stateTimer = 0;
    this.callbacks.onEnterPatrol();
  }

  /** Decrementa el timer basándose en el deltaTime de la simulación. */
  public tick(deltaTime: number): void {
    if (this._stateTimer > 0) {
      this._stateTimer -= deltaTime;
      if (this._stateTimer < 0) {
        this._stateTimer = 0;
      }
    }
  }

  /** Configura un límite de tiempo explícito para el estado en curso (Fine Tuning). */
  public setStateTimer(seconds: number): void {
    this._stateTimer = seconds;
  }

  /** Cambia el estado activo y dispara la lógica de entrada correspondiente. */
  public transitionTo(newState: DummyKamikazeState): void {
    if (this._state === newState) return;

    if (import.meta.env.DEV) {
      console.info(`[DummyKamikazeFsm] Transición: ${this._state} -> ${newState}`);
    }

    this._state = newState;
    this._stateTimer = 0;

    switch (newState) {
      case "Patrol":    this.callbacks.onEnterPatrol(); break;
      case "Spotting":  this.callbacks.onEnterSpotting(); break;
      case "Chasing":   this.callbacks.onEnterChasing(); break;
      case "Charging":  this.callbacks.onEnterCharging(); break;
      case "Returning": this.callbacks.onEnterReturning(); break;
      case "Exploding": this.callbacks.onEnterExploding(); break;
    }
  }

  public dispose(): void {}
}
