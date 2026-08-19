// src/poc2-floating_board_fsm/contracts/ibase-fsm.ts

export interface IBaseFsm<TState extends string> {
  setState(next: TState): void;
  getState(): TState;
  onStateChange(cb: (state: TState) => void): void;
  isBlocking(): boolean;
  dispose(): void;
}