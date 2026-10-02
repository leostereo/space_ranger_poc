import { TransformNode } from "@babylonjs/core";
import { Observable } from "@babylonjs/core/Misc/observable";
import { BaseFsm, TransitionTable } from "../../abstract/base-fsm";
import { OnGroundFsm, type OnGroundSubState } from "./character.fsm.stand-alone.on-ground";
import { OnGroundCrouchedFsm, type OnGroundCrouchedSubState } from "./character.fsm.stand-alone.on-ground-crouched";
import { SHIELD_OFFSETS, WEAPON_OFFSETS } from "../../character.base";

export type StandAloneSubState = "OnGround" | "JumpImpulseStart" | "RunningJumpImpulseStart" | "OnAir" | "Crouch" | "CrouchRollStart"; // CAMBIADO

/** NUEVO — contexto de un impacto/muerte: define qué clip usar. */
export interface StandAloneImpactContext {
  crouched: boolean;
}

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
  isShieldHeld: () => boolean;
  isCrouchHeld: () => boolean;
  weaponRoot: TransformNode;
  shieldRoot: TransformNode;
  onEnterCrouch: () => void;
  onExitCrouch: () => void;
  onEnterCrouchRoll: () => void;
  onExitCrouchRoll: () => void;
  onEnterHitStun: () => void; // NUEVO
  onExitHitStun: () => void;  // NUEVO
}


export class StandAloneFsm extends BaseFsm<StandAloneSubState> {

  protected transitions: TransitionTable<StandAloneSubState>;
  readonly onGroundSubFsm: OnGroundFsm;
  readonly onGroundCrouchedSubFsm: OnGroundCrouchedFsm;
  private cameFromRunningJump = false;

  /** NUEVO — el animation controller se suscribe para reproducir el clip de reacción. */
  readonly onHitReactionObservable = new Observable<StandAloneImpactContext>();
  /** NUEVO — el animation controller se suscribe para reproducir el clip de muerte. */
  readonly onDeathObservable = new Observable<StandAloneImpactContext>();
  private hitStunned = false; // NUEVO

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
      isShieldHeld: this.deps.isShieldHeld,
      getVerticalSpeed: this.deps.getVerticalSpeed,
      getHorizontalSpeed: this.deps.getHorizontalSpeed,
      onEnterLandingRoll: this.deps.onEnterLandingRoll,
      onExitLandingRoll: this.deps.onExitLandingRoll,
      weaponRoot: this.deps.weaponRoot,
      shieldRoot: this.deps.shieldRoot
    });

    this.onGroundCrouchedSubFsm = new OnGroundCrouchedFsm({ // NUEVO
      isForwardHeld: this.deps.isForwardHeld,
      isBackwardHeld: this.deps.isBackwardHeld,
      weaponRoot: this.deps.weaponRoot,
      shieldRoot: deps.shieldRoot, // NUEVO
    });

    this.transitions = {
      OnGround: {
        JumpImpulseStart: true,
        RunningJumpImpulseStart: true,
        OnAir: () => !this.deps.isGroundDetected() && !this._isLandingInProgress(),
        Crouch: () => this.deps.isCrouchHeld() && this._isCrouchableGroundState(),
        CrouchRollStart: true,
      },
      JumpImpulseStart: { OnAir: true },
      RunningJumpImpulseStart: { OnAir: true },
      OnAir: { OnGround: () => this.deps.isGroundDetected() },
      Crouch: {
        OnGround: () => !this.deps.isCrouchHeld(),
      },
      CrouchRollStart: {
        OnGround: true,
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

  getActiveSubState(): OnGroundSubState | OnGroundCrouchedSubState | "JumpImpulseStart" | "RunningJumpImpulseStart" | "OnAir" | 'CrouchRollStart' { // CAMBIADO — sin "Crouch"
    if (this.state === "OnGround") return this.onGroundSubFsm.getState();
    if (this.state === "Crouch") return this.onGroundCrouchedSubFsm.getState();
    return this.state;
  }

  requestJump(): void {
    if (this.state !== "OnGround" || this.hitStunned) return; // CAMBIADO — sin saltar durante la reacción al hit

    const isRunning = this.onGroundSubFsm.getState() === "Running";
    this.setState(isRunning ? "RunningJumpImpulseStart" : "JumpImpulseStart");
  }

  requestCrouchRoll(): void { // NUEVO
    if (this.state !== "OnGround" || this.hitStunned) return; // CAMBIADO — sin rodar durante la reacción al hit
    if (this.onGroundSubFsm.getState() !== "Running") return;
    this.setState("CrouchRollStart");
  }

  /** Llamado por el AnimationEvent del clip "running_roll" al llegar al frame final. */
  notifyCrouchRollComplete(): void { // NUEVO
    if (this.state === "CrouchRollStart") {
      this.setState("OnGround");
    }
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

  // ── Hit / muerte ───────────────────────────────────────────────────────

  isHitStunned(): boolean { // NUEVO
    return this.hitStunned;
  }

  /** NUEVO — sólo en suelo (de pie o agachado), en estados "limpios", y fuera de un stun en curso. */
  canReceiveHit(): boolean {
    if (this.hitStunned) return false;
    if (this.state === "Crouch") return true;
    if (this.state === "OnGround") return this._isHitReactableGroundState();
    return false;
  }

  /** NUEVO — hit sin cambio de estado: stun (freno) + pedido de animación. */
  notifyHit(): void {
    if (!this.canReceiveHit()) return;
    this.hitStunned = true;
    this.deps.onEnterHitStun();
    this.onHitReactionObservable.notifyObservers({ crouched: this.state === "Crouch" });
  }

  /** NUEVO — llamado por el animation controller al terminar el clip de reacción. */
  notifyHitReactionComplete(): void {
    if (!this.hitStunned) return;
    this.hitStunned = false;
    this.deps.onExitHitStun();
  }

  /** NUEVO — llamado por CharacterFsm justo antes de pasar a "Dead". */
  notifyDeath(): void {
    this.hitStunned = false;
    this.onDeathObservable.notifyObservers({ crouched: this.state === "Crouch" });
  }

  private _isHitReactableGroundState(): boolean { // NUEVO
    const s = this.onGroundSubFsm.getState();
    return (
      s === "Idle" || s === "Walking" || s === "WalkingBackwards" || s === "Running" ||
      s === "ShootingStrafeLeft" || s === "ShootingStrafeRight"
    );
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
      this.deps.onEnterCrouch();
      this._applyWeaponOffset(WEAPON_OFFSETS.crouchIdle);
      this._applyShieldOffset(SHIELD_OFFSETS.crouchIdle);
    }
    if (state === "CrouchRollStart") { // NUEVO
      this.deps.onEnterCrouchRoll();
    }
  }

  protected onExit(state: StandAloneSubState): void {
    if (state === "JumpImpulseStart") {
      this.deps.onExitJumpWindup();
    }
    if (state === "Crouch") {
      this._applyWeaponOffset(WEAPON_OFFSETS.standAlone);
      this._applyShieldOffset(SHIELD_OFFSETS.idle);
      this.deps.onExitCrouch();
    }
    if (state === "CrouchRollStart") { // NUEVO
      this.deps.onExitCrouchRoll();
    }
  }

  private _applyWeaponOffset(offset: { x: number; y: number; z: number }): void {
    this.deps.weaponRoot?.position.set(offset.x, offset.y, offset.z);
  }

  private _applyShieldOffset(offset: { x: number; y: number; z: number }): void {
    this.deps.shieldRoot?.position.set(offset.x, offset.y, offset.z);
  }

  dispose(): void {
    this.onHitReactionObservable.clear(); // NUEVO
    this.onDeathObservable.clear();       // NUEVO
    this.onGroundSubFsm.dispose();
    this.onGroundCrouchedSubFsm.dispose(); // NUEVO
  }
}