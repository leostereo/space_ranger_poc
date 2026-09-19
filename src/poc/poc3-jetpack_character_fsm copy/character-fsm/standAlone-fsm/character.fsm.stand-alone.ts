import { TransformNode } from "@babylonjs/core";
import { BaseFsm, TransitionTable } from "../../abstract/base-fsm";
import { OnGroundFsm, type OnGroundSubState } from "./character.fsm.stand-alone.on-ground";
import { OnGroundCrouchedFsm, type OnGroundCrouchedSubState } from "./character.fsm.stand-alone.on-ground-crouched";

export type StandAloneSubState = "OnGround" | "JumpImpulseStart" | "RunningJumpImpulseStart" | "OnAir" | "Crouch";

export interface StandAloneFsmDeps {
  isGroundDetected: () => boolean;
  onEnterOnAir: () => void;
  isForwardHeld: () => boolean;
  isBackwardHeld: () => boolean;
  isRunHeld: () => boolean;
  getVerticalSpeed: () => number;
  getHorizontalSpeed: () => number;
  onEnterLandingRoll: () => void;
  onExitLandingRoll: () => void;
  onEnterJumpWindup: () => void;
  onExitJumpWindup: () => void;
  onEnterRunningJumpOnAir: () => void;
  isLeftHeld: () => boolean;
  isRightHeld: () => boolean;
  isAimingHeld: () => boolean;
  isCrouchHeld: () => boolean;
  weaponRoot: TransformNode;
  onEnterCrouch: () => void; // NUEVO
  onExitCrouch: () => void;  // NUEVO
}

export class StandAloneFsm extends BaseFsm<StandAloneSubState> {

  protected transitions: TransitionTable<StandAloneSubState>;
  readonly onGroundSubFsm: OnGroundFsm;
  readonly onGroundCrouchedSubFsm: OnGroundCrouchedFsm;
  private cameFromRunningJump = false;

  constructor(private deps: StandAloneFsmDeps) {
    super();
    this.state = "OnGround";

    this.onGroundSubFsm = new OnGroundFsm({
      isForwardHeld: this.deps.isForwardHeld, // CAMBIADO
      isBackwardHeld: this.deps.isBackwardHeld,
      isRunHeld: this.deps.isRunHeld,
      isLeftHeld: this.deps.isLeftHeld,
      isRightHeld: this.deps.isRightHeld,
      isAimingHeld: this.deps.isAimingHeld,
      getVerticalSpeed: this.deps.getVerticalSpeed,
      getHorizontalSpeed: this.deps.getHorizontalSpeed,
      onEnterLandingRoll: this.deps.onEnterLandingRoll,
      onExitLandingRoll: this.deps.onExitLandingRoll,
      weaponRoot: this.deps.weaponRoot
    });

    this.onGroundCrouchedSubFsm = new OnGroundCrouchedFsm({ // NUEVO
      isForwardHeld: this.deps.isForwardHeld,
      isBackwardHeld: this.deps.isBackwardHeld,
      weaponRoot: this.deps.weaponRoot
    });

    this.transitions = {
      OnGround: {
        JumpImpulseStart: true,
        RunningJumpImpulseStart: true,
        OnAir: () => !this.deps.isGroundDetected() && !this._isLandingInProgress(),
        Crouch: () => this.deps.isCrouchHeld() && this._isCrouchableGroundState(), // NUEVO
      },
      JumpImpulseStart: { OnAir: true },
      RunningJumpImpulseStart: { OnAir: true },
      OnAir: { OnGround: () => this.deps.isGroundDetected() },
      Crouch: { // NUEVO
        OnGround: () => !this.deps.isCrouchHeld(),
      },
    };
  }

  public override tick(): void {
    super.tick();
    if (this.state === "OnGround") {
      this.onGroundSubFsm.tick();
    } else if (this.state === "Crouch") {
      this.onGroundCrouchedSubFsm.tick();
    }
  }

  private _isCrouchableGroundState(): boolean { // NUEVO
    const s = this.onGroundSubFsm.getState();
    return s === "Idle" || s === "Walking" || s === "WalkingBackwards";
  }

  getActiveSubState(): OnGroundSubState | OnGroundCrouchedSubState | "JumpImpulseStart" | "RunningJumpImpulseStart" | "OnAir" { // CAMBIADO — sin "Crouch"
    if (this.state === "OnGround") return this.onGroundSubFsm.getState();
    if (this.state === "Crouch") return this.onGroundCrouchedSubFsm.getState();
    return this.state;
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
    if (state === "Crouch") {
      this.onGroundCrouchedSubFsm.resetToIdle();
      this.deps.onEnterCrouch(); // NUEVO
    }
  }

  protected onExit(state: StandAloneSubState): void {
    if (state === "JumpImpulseStart") {
      this.deps.onExitJumpWindup();
    }
    if (state === "Crouch") { // NUEVO
      this.deps.onExitCrouch();
    }
  }

  dispose(): void {
    this.onGroundSubFsm.dispose();
    this.onGroundCrouchedSubFsm.dispose(); // NUEVO
  }
}