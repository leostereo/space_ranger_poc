// src/poc3-jetpack_character_fsm/abstract/base-fsm.ts
// Copiado tal cual de poc2 (POCs aislados, sin import cruzado entre carpetas de poc).
import { Observable } from "@babylonjs/core/Misc/observable";
import { IBaseFsm } from "../contracts/ibase-fsm";

export type TransitionGuard = () => boolean;
export type TransitionTable<TState extends string> =
  Partial<Record<TState, Partial<Record<TState, TransitionGuard | true>>>>;

export abstract class BaseFsm<TState extends string> implements IBaseFsm<TState> {

  protected state!: TState;
  protected previousState: TState | null = null; // NUEVO
  protected _isBlocking = false;
  private stateObservable = new Observable<TState>();

  protected abstract transitions: TransitionTable<TState>;

  setState(next: TState): void {
    if (this._isBlocking) return;
    if (!this.isValidTransition(next)) return;

    const prev = this.state;
    this.previousState = prev; // NUEVO
    this.state = next;
    this.onExit(prev);
    this.onEnter(next);
    this.stateObservable.notifyObservers(next);
  }

  getState(): TState { return this.state; }

  isBlocking(): boolean { return this._isBlocking; }

  onStateChange(cb: (state: TState) => void): void {
    this.stateObservable.add(cb);
  }

  tick(): void {
    const candidates = this.transitions[this.state];
    if (!candidates) return;

    for (const next of Object.keys(candidates) as TState[]) {
      const guard = candidates[next];
      if (guard === true) continue; // event-triggered, no automático
      this.setState(next);
    }
  }

  protected abstract onEnter(state: TState): void;
  protected abstract onExit(state: TState): void;
  abstract dispose(): void;

  private isValidTransition(next: TState): boolean {
    const stateTransitions = this.transitions[this.state];
    if (!stateTransitions) return false;

    const guard = stateTransitions[next];
    if (guard === undefined) return false;
    if (guard === true) return true;
    return guard();
  }
}
