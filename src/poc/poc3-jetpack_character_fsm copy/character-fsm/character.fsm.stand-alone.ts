import { BaseFsm, TransitionTable } from "../abstract/base-fsm";
import { OnGroundFsm, type OnGroundSubState } from "./character.fsm.stand-alone.on-ground";

export type StandAloneSubState = "OnGround" | "JumpImpulseStart" | "OnAir";

export interface StandAloneFsmDeps {
  isGroundDetected: () => boolean;
  onEnterOnAir: () => void;
  isMoveHeld: () => boolean;
  isRunHeld: () => boolean;
  getVerticalSpeed: () => number;
  getHorizontalSpeed: () => number;
  onEnterLandingRoll: () => void;
  onExitLandingRoll: () => void;
  onEnterJumpWindup: () => void;
  onExitJumpWindup: () => void;
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
        // NUEVO: mientras hay un landing en curso, ignorar rebotes transitorios del
        // ground detection — evita que la animación de landing se corte por un
        // micro-rebote físico (ej. mesh nuevo sin restitution configurado).
        OnAir: () => !this.deps.isGroundDetected() && !this._isLandingInProgress(),
      },
      JumpImpulseStart: {
        OnAir: true,
      },
      OnAir: {
        OnGround: () => this.deps.isGroundDetected(),
      },
    };
  }

  private _isLandingInProgress(): boolean {
    const state = this.onGroundSubFsm.getState();
    return state === "LandingSoft" || state === "LandingRoll" || state === "LandingCrash";
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
    if (state === "JumpImpulseStart") {
      this.deps.onEnterJumpWindup();
    }
  }

  protected onExit(state: StandAloneSubState): void {
    if (state === "JumpImpulseStart") {
      this.deps.onExitJumpWindup();
    }
  }

  dispose(): void {
    this.onGroundSubFsm.dispose();
  }
}