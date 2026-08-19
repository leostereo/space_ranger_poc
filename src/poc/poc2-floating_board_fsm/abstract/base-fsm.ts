// src/poc2-floating_board_fsm/abstract/base-fsm.ts
import { Observable } from "@babylonjs/core/Misc/observable";
import type { IBaseFsm } from "../contracts/ibase-fsm";

export type TransitionGuard = () => boolean;
export type TransitionTable<TState extends string> =
  Partial<Record<TState, Partial<Record<TState, TransitionGuard | true>>>>;

export abstract class BaseFsm<TState extends string> implements IBaseFsm<TState> {

  protected state!: TState;
  protected _isBlocking = false;
  private stateObservable = new Observable<TState>();

  // ─────────────────────────────────────────────
  //  TABLA DE TRANSICIONES — cada subclase define la suya
  // ─────────────────────────────────────────────
  protected abstract transitions: TransitionTable<TState>;

  // ─────────────────────────────────────────────
  //  API PÚBLICA
  // ─────────────────────────────────────────────
  setState(next: TState): void {
    if (this._isBlocking) return;
    if (!this.isValidTransition(next)) return;

    const prev = this.state;
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

  /**
   * Prueba las transiciones candidatas declaradas en `transitions` para el estado
   * actual QUE TENGAN GUARD (función) — las marcadas con `true` son event-triggered
   * (sólo se disparan cuando algo las pide explícitamente vía setState()/requestX(),
   * nunca automáticamente) y se ignoran acá a propósito. Si se auto-probaran, cualquier
   * transición `true` se dispararía sola en cada frame apenas el estado la habilita.
   */
  tick(): void {
    const candidates = this.transitions[this.state];
    if (!candidates) return;

    for (const next of Object.keys(candidates) as TState[]) {
      const guard = candidates[next];
      if (guard === true) continue; // event-triggered, no automático
      this.setState(next); // no-op si el guard rechaza o si el estado ya cambió en esta misma iteración
    }
  }

  // ─────────────────────────────────────────────
  //  CONTRATO INTERNO
  // ─────────────────────────────────────────────
  protected abstract onEnter(state: TState): void;
  protected abstract onExit(state: TState): void;
  abstract dispose(): void;

  // ─────────────────────────────────────────────
  //  VALIDACIÓN DE TRANSICIÓN
  // ─────────────────────────────────────────────
  private isValidTransition(next: TState): boolean {
    const stateTransitions = this.transitions[this.state];
    if (!stateTransitions) return false;

    const guard = stateTransitions[next];
    if (guard === undefined) return false;
    if (guard === true) return true;
    return guard();
  }
}