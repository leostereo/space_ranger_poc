import { BaseFsm, TransitionTable } from "../abstract/base-fsm";
import { OnGroundFsm, type OnGroundSubState } from "./character.fsm.stand-alone.on-ground";

export type StandAloneSubState = "OnGround" | "JumpImpulseStart" | "OnAir";

export interface StandAloneFsmDeps {
  isGroundDetected: () => boolean;
  onEnterOnAir: () => void;
  isMoveHeld: () => boolean;
  isRunHeld: () => boolean;
  /** Threading hacia OnGroundFsmDeps, mismo criterio que isMoveHeld/isRunHeld. */
  getVerticalSpeed: () => number;
  getHorizontalSpeed: () => number;
  onEnterLandingRoll: () => void;
  onExitLandingRoll: () => void;
}

export class StandAloneFsm extends BaseFsm<StandAloneSubState> {
  protected transitions: TransitionTable<StandAloneSubState>;

  readonly onGroundSubFsm: OnGroundFsm;

  constructor(private deps: StandAloneFsmDeps) {
    super();
    this.state = "OnGround";

    this.onGroundSubFsm = new OnGroundFsm({
      isMoveHeld: this.deps.isMoveHeld,
      isRunHeld: this.deps.isRunHeld,
      getVerticalSpeed: this.deps.getVerticalSpeed,
      getHorizontalSpeed: this.deps.getHorizontalSpeed,
      onEnterLandingRoll: this.deps.onEnterLandingRoll,
      onExitLandingRoll: this.deps.onExitLandingRoll,
    });

    this.transitions = {
      OnGround: {
        JumpImpulseStart: true,
        OnAir: () => !this.deps.isGroundDetected(),
      },
      JumpImpulseStart: {
        OnAir: true,
      },
      OnAir: {
        OnGround: () => this.deps.isGroundDetected(),
      },
    };
  }

  public override tick(): void {
    super.tick();
    if (this.state === "OnGround") {
      this.onGroundSubFsm.tick();
    }
  }

  requestJump(): void {
    if (this.state === "OnGround") {
      this.setState("JumpImpulseStart");
    }
  }

  notifyJumpImpulseFrame(): void {
    if (this.state === "JumpImpulseStart") {
      this.setState("OnAir");
    }
  }

  getActiveSubState(): OnGroundSubState | "JumpImpulseStart" | "OnAir" {
    return this.state === "OnGround" ? this.onGroundSubFsm.getState() : this.state;
  }

  protected onEnter(state: StandAloneSubState): void {
    if (state === "OnAir" && this.previousState === "JumpImpulseStart") {
      this.deps.onEnterOnAir();
    }
    if (state === "OnGround" && this.previousState === "OnAir") {
      this.onGroundSubFsm.notifyLanding();
    }
  }

  protected onExit(_state: StandAloneSubState): void { }

  dispose(): void {
    this.onGroundSubFsm.dispose();
  }
}