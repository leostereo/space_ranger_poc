export type DummyKamikazeState =
  | "Patrol"
  | "Spotting"
  | "Chasing"
  | "Charging"
  | "Stunned"
  | "Returning"
  | "Exploding";

export interface DummyKamikazeFsmCallbacks {
  readonly onEnterPatrol: () => void;
  readonly onEnterSpotting: () => void;
  readonly onEnterChasing: () => void;
  readonly onEnterCharging: () => void;
  readonly onEnterStunned: () => void;
  readonly onEnterReturning: () => void;
  readonly onEnterExploding: () => void;
}

/**
 * Controla el ciclo de vida de los estados del DummyKamikazeDrone
 * y maneja de forma desacoplada el tiempo restante de cada estado.
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

  /** Inicializa la FSM en el estado de Patrulla. */
  public start(): void {
    this._state = "Patrol";
    this._stateTimer = 0;
    this.callbacks.onEnterPatrol();
  }

  /** 
   * Decrementa el temporizador interno basándose en el deltaTime del frame.
   * Se ejecuta al inicio del onThink del Drone.
   */
  public tick(deltaTime: number): void {
    if (this._stateTimer > 0) {
      this._stateTimer -= deltaTime;
      if (this._stateTimer < 0) {
        this._stateTimer = 0;
      }
    }
  }

  /** Modifica el temporizador del estado actual (Fine Tuning desde el Drone). */
  public setStateTimer(seconds: number): void {
    this._stateTimer = seconds;
  }

  /** Realiza la transición limpiamente y dispara los eventos de entrada. */
  public transitionTo(newState: DummyKamikazeState): void {
    if (this._state === newState) return;

    if (import.meta.env.DEV) {
      console.info(`[DummyKamikazeFsm] Transición: ${this._state} -> ${newState}`);
    }

    this._state = newState;
    this._stateTimer = 0; // Limpieza por defecto

    switch (newState) {
      case "Patrol":    this.callbacks.onEnterPatrol(); break;
      case "Spotting":  this.callbacks.onEnterSpotting(); break;
      case "Chasing":   this.callbacks.onEnterChasing(); break;
      case "Charging":  this.callbacks.onEnterCharging(); break;
      case "Stunned":   this.callbacks.onEnterStunned(); break;
      case "Returning": this.callbacks.onEnterReturning(); break;
      case "Exploding": this.callbacks.onEnterExploding(); break;
    }
  }

  public dispose(): void {
    // Espacio para desuscripción de eventos globales si se añaden a futuro
  }
}
