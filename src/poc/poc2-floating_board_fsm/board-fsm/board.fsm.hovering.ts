// src/poc2-floating_board_fsm/board-fsm/board.fsm.hovering.ts
import { BaseFsm, TransitionTable } from "../abstract/base-fsm";
import { generalConfig } from "../../config.general";

export type HoveringSubState = "CruisingIdle" | "CruisingFast" | "CruisingVeryFast" | "Jumping";

/** B1b — Hovering: 3 sub-estados de Cruising (según forwardSpeed, con hysteresis) <-> Jumping. */
export class BoardFsmHovering extends BaseFsm<HoveringSubState> {
  protected transitions: TransitionTable<HoveringSubState>;

  constructor(
    private isJumpSettled: () => boolean,
    private onEnterJumping: () => void,
    private getForwardSpeed: () => number,
  ) {
    super();
    this.state = "CruisingIdle";

    const { idleToFast, fastToIdle, fastToVeryFast, veryFastToFast } =
      generalConfig.cruising.speedThresholds;

    this.transitions = {
      CruisingIdle: {
        Jumping: true,
        CruisingFast: () => this.getForwardSpeed() > idleToFast,
      },
      CruisingFast: {
        Jumping: true,
        CruisingVeryFast: () => this.getForwardSpeed() > fastToVeryFast,
        CruisingIdle: () => this.getForwardSpeed() < fastToIdle,
      },
      CruisingVeryFast: {
        Jumping: true,
        CruisingFast: () => this.getForwardSpeed() < veryFastToFast,
      },
      Jumping: {
        // Evaluado en orden: aterriza en el sub-estado que corresponda a la velocidad actual.
        CruisingVeryFast: () => this.isJumpSettled() && this.getForwardSpeed() > fastToVeryFast,
        CruisingFast: () => this.isJumpSettled() && this.getForwardSpeed() > idleToFast,
        CruisingIdle: () => this.isJumpSettled(),
      },
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