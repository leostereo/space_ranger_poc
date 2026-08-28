import { generalConfig } from "@/poc/config.general";
import { BaseFsm, TransitionTable } from "../../abstract/base-fsm";

export type HoveringSubState =
  | "CruisingIdle"
  | "CruisingFast"
  | "CruisingVeryFast"
  | "JumpImpulseStart"
  | "Jumping";

export class BoardFsmHovering extends BaseFsm<HoveringSubState> {
  protected transitions: TransitionTable<HoveringSubState>;

  constructor(
    private isJumpSettled: () => boolean,
    private onEnterJumping: () => void, // sigue existiendo: sólo aplica el impulso físico
    private getForwardSpeed: () => number,
  ) {
    super();
    this.state = "CruisingIdle";

    const { idleToFast, fastToIdle, fastToVeryFast, veryFastToFast } =
      generalConfig.cruising.speedThresholds;

    this.transitions = {
      CruisingIdle: {
        JumpImpulseStart: true,
        CruisingFast: () => this.getForwardSpeed() > idleToFast,
      },
      CruisingFast: {
        JumpImpulseStart: true,
        CruisingVeryFast: () => this.getForwardSpeed() > fastToVeryFast,
        CruisingIdle: () => this.getForwardSpeed() < fastToIdle,
      },
      CruisingVeryFast: {
        JumpImpulseStart: true,
        CruisingFast: () => this.getForwardSpeed() < veryFastToFast,
      },
      JumpImpulseStart: {
            Jumping: true, // 👈 legal, pero sólo se dispara vía setState manual (notifyJumpImpulseFrame), no por tick()

      }, // sólo sale vía notifyJumpImpulseFrame() (setState manual)
      Jumping: {
        CruisingVeryFast: () => this.isJumpSettled() && this.getForwardSpeed() > fastToVeryFast,
        CruisingFast: () => this.isJumpSettled() && this.getForwardSpeed() > idleToFast,
        CruisingIdle: () => this.isJumpSettled(),
      },
    };
  }

  requestJump(): void {
    this.setState("JumpImpulseStart");
  }

  /** Llamado por el animator (no por el controller) al llegar al frame de impacto. */
  notifyJumpImpulseFrame(): void {
    if (this.state === "JumpImpulseStart") {
      this.setState("Jumping");
    }
  }

  protected onEnter(state: HoveringSubState): void {
    if (state === "Jumping") this.onEnterJumping(); // sólo esto sigue siendo callback
  }

  protected onExit(_state: HoveringSubState): void {}

  dispose(): void {}
}