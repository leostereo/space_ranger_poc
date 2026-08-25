// src/poc3-jetpack_character_fsm/contracts/ibase-fsm.ts
// Copiado tal cual de poc2 (POCs aislados, sin import cruzado entre carpetas de poc).

export interface IBaseFsm<TState extends string> {
  setState(next: TState): void;
  getState(): TState;
  onStateChange(cb: (state: TState) => void): void;
  isBlocking(): boolean;
  dispose(): void;
}
