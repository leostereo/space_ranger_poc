export type StaticDroneState =
  | "Orienting"
  | "Scanning"
  | "Engaging"
  | "Exploding";

export interface StaticDroneFsmCallbacks {
  readonly onEnterOrienting: () => void;
  readonly onEnterScanning: () => void;
  readonly onEnterEngaging: () => void;
  readonly onEnterExploding: () => void;
}

export class StaticDroneFsm {
  private _state: StaticDroneState = "Orienting";
  private _stateTimer = 0;

  constructor(private readonly callbacks: StaticDroneFsmCallbacks) {}

  public get state(): StaticDroneState {
    return this._state;
  }

  public get stateTimer(): number {
    return this._stateTimer;
  }

  public start(): void {
    this._state = "Orienting";
    this._stateTimer = 0;
    this.callbacks.onEnterOrienting();
  }

  public tick(deltaTime: number): void {
    if (this._stateTimer > 0) {
      this._stateTimer = Math.max(0, this._stateTimer - deltaTime);
    }
  }

  public setStateTimer(seconds: number): void {
    this._stateTimer = seconds;
  }

  public transitionTo(newState: StaticDroneState): void {
    if (this._state === newState) return;

    if (import.meta.env.DEV) {
      console.info(`[StaticDroneFsm] Transición: ${this._state} -> ${newState}`);
    }

    this._state = newState;
    this._stateTimer = 0;

    switch (newState) {
      case "Orienting": this.callbacks.onEnterOrienting(); break;
      case "Scanning":  this.callbacks.onEnterScanning(); break;
      case "Engaging":  this.callbacks.onEnterEngaging(); break;
      case "Exploding": this.callbacks.onEnterExploding(); break;
    }
  }

  public dispose(): void {}
}
