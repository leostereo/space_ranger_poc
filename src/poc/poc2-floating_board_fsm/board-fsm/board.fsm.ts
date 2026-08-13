// src/poc2-floating_board_fsm/board-fsm/board.fsm.ts
import { BaseFsm, TransitionTable } from "../abstract/base-fsm";

export type BoardMotionState = "Hovering" | "Falling";

/** B1 — Skateboard: decide entre B1b (Hovering) y B1a (Falling). */
export class BoardFsm extends BaseFsm<BoardMotionState> {
  protected transitions: TransitionTable<BoardMotionState>;

  constructor(
    /** true si el raycast detecta ground dentro del rango de hover (con hysteresis ya aplicada) */
    private isGroundDetected: () => boolean,
    /** segundos transcurridos desde que se perdió el contacto con el ground */
    private groundLostElapsed: () => number,
    private coyoteTime: number,
    private onEnterHovering: () => void,
    private onEnterFalling: () => void,
  ) {
    super();
    this.state = "Hovering"; // estado inicial: se asigna directo, no vía setState

    this.transitions = {
      Hovering: {
        Falling: () => !this.isGroundDetected() && this.groundLostElapsed() >= this.coyoteTime,
      },
      Falling: {
        Hovering: () => this.isGroundDetected(),
      },
    };
  }

  protected onEnter(state: BoardMotionState): void {
    if (state === "Hovering") this.onEnterHovering();
    if (state === "Falling") this.onEnterFalling();
  }

  protected onExit(_state: BoardMotionState): void {
    // sin side-effects por ahora
  }

  dispose(): void {
    // sin recursos que liberar por ahora
  }
}