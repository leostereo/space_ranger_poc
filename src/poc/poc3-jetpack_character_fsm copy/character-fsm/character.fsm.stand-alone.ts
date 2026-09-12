import { BaseFsm, TransitionTable } from "../abstract/base-fsm";
import { OnGroundFsm, type OnGroundSubState } from "./character.fsm.stand-alone.on-ground";

export type StandAloneSubState = "OnGround" | "JumpImpulseStart" | "RunningJumpImpulseStart" | "OnAir";

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
  onEnterRunningJumpOnAir: () => void; // NUEVO
}

export class StandAloneFsm extends BaseFsm<StandAloneSubState> {

  protected transitions: TransitionTable<StandAloneSubState>;
  readonly onGroundSubFsm: OnGroundFsm;
  private cameFromRunningJump = false;

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
        RunningJumpImpulseStart: true, // NUEVO
        OnAir: () => !this.deps.isGroundDetected() && !this._isLandingInProgress(),
      },
      JumpImpulseStart: {
        OnAir: true,
      },
      RunningJumpImpulseStart: { // NUEVO
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
    if (this.state !== "OnGround") return;

    const isRunning = this.onGroundSubFsm.getState() === "Running";
    this.setState(isRunning ? "RunningJumpImpulseStart" : "JumpImpulseStart");
  }

  notifyJumpImpulseFrame(): void {
    if (this.state === "JumpImpulseStart") {
      this.setState("OnAir");
    }
  }

  /** Llamado por el AnimationEvent del clip "jump_while_running" al llegar al frame de impulso. */
  notifyRunningJumpImpulseFrame(): void {
    if (this.state === "RunningJumpImpulseStart") {
      this.setState("OnAir");
    }
  }

  getActiveSubState(): OnGroundSubState | "JumpImpulseStart" | "RunningJumpImpulseStart" | "OnAir" {
    return this.state === "OnGround" ? this.onGroundSubFsm.getState() : this.state;
  }

  private _isLandingInProgress(): boolean {
    const state = this.onGroundSubFsm.getState();
    return state === "LandingSoft" || state === "LandingRoll" || state === "LandingCrash";
  }

  protected onEnter(state: StandAloneSubState): void {
    if (state === "OnAir" && this.previousState === "JumpImpulseStart") {
      this.deps.onEnterOnAir();
    }
    if (state === "OnAir" && this.previousState === "RunningJumpImpulseStart") {
      this.deps.onEnterRunningJumpOnAir();
      this.cameFromRunningJump = true; // NUEVO — marca este vuelo específico
    }
    if (state === "OnGround" && this.previousState === "OnAir") {
      if (this.cameFromRunningJump) {
        // NUEVO: sin decisión de landing — onGroundSubFsm quedó congelado en "Running"
        // (nunca se tocó mientras estaba en el aire), así que retoma directo ahí, sin
        // pasar por LandingSoft/Roll/Crash.
        this.cameFromRunningJump = false;
      } else {
        this.onGroundSubFsm.notifyLanding();
      }
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