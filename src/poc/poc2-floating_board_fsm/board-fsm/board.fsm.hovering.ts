// src/poc2-floating_board_fsm/board-fsm/board.fsm.hovering.ts
import { BaseFsm, TransitionTable } from "../abstract/base-fsm";

export type HoveringSubState = "Cruising" | "Jumping";

/** B1b — Hovering: Cruising <-> Jumping. */
export class BoardFsmHovering extends BaseFsm<HoveringSubState> {
  protected transitions: TransitionTable<HoveringSubState>;

  constructor(
    /** true cuando el impulso de salto ya se consumió y corresponde volver a Cruising */
    private isJumpSettled: () => boolean,
    private onEnterJumping: () => void,
  ) {
    super();
    this.state = "Cruising";

    this.transitions = {
      Cruising: { Jumping: true },
      Jumping: { Cruising: () => this.isJumpSettled() },
    };
  }

  /** Llamar desde el input handler cuando se presiona Space estando en Hovering. */
  requestJump(): void {
    this.setState("Jumping");
  }

  protected onEnter(state: HoveringSubState): void {
    if (state === "Jumping") this.onEnterJumping();
  }

  protected onExit(_state: HoveringSubState): void {}

  dispose(): void {}
}