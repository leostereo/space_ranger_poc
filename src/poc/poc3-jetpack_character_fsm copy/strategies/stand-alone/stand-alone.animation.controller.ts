// stand-alone.animation.controller.ts
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { ICharacterAnimations } from "@/services/assets-manager";
import type { IAnimationController } from "../contracts/ianimation-controller";
import type { StandAloneFsm } from "../../character-fsm/character.fsm.stand-alone";
import type { OnGroundSubState } from "../../character-fsm/character.fsm.stand-alone.on-ground";
import { OnGroundCrouchedSubState } from "../../character-fsm/character.fsm.stand-alone.on-ground-crouched";

/** Combina el estado flat de StandAloneFsm con el sub-estado real de OnGroundFsm cuando aplica —
 * mismo valor que devuelve StandAloneFsm.getActiveSubState(). */
type ResolvedStandAloneState = OnGroundSubState | OnGroundCrouchedSubState | "JumpImpulseStart" | "OnAir" | "RunningJumpImpulseStart";

export class StandAloneAnimationController implements IAnimationController {
  private currentAnimation: AnimationGroup | null = null;
  private isPlayingTransient = false; // NUEVO

  constructor(
    private animations: ICharacterAnimations | null,
    private standAloneFsm: StandAloneFsm,
    private isAiming: () => boolean, // NUEVO
  ) {
    this.standAloneFsm.onStateChange(() => this._render(this.standAloneFsm.getActiveSubState()));
    this.standAloneFsm.onGroundSubFsm.onStateChange(() => this._render(this.standAloneFsm.getActiveSubState()));
    this.standAloneFsm.onGroundCrouchedSubFsm.onStateChange(() => this._render(this.standAloneFsm.getActiveSubState())); // NUEVO
    this._render(this.standAloneFsm.getActiveSubState());

    if (this.animations) {
      this.animations.normal_landing.from = 20;
      this.animations.normal_landing.speedRatio = 1.6;
      this.animations.crash_landing.from = 20;
      this.animations.roll_landing.from = 10;
      this.animations.roll_landing.speedRatio = 1.6;
    }
  }

  tick(): void {
    //this._render(this.standAloneFsm.getActiveSubState());
  }

  dispose(): void {
    this.currentAnimation?.stop();
  }

  private _render(state: ResolvedStandAloneState): void {
    if (this.isPlayingTransient) return;

    const resolved = this._resolve(state);
    if (!resolved || this.currentAnimation === resolved.animation) return;

    this.currentAnimation?.stop();
    this.currentAnimation = resolved.animation;

    if (resolved.waitForCompletion) {
      // CAMBIADO: sólo estados marcados explícitamente esperan a que el clip termine
      // solo — el salto normal, por ejemplo, necesita seguir cortándose apenas se entra
      // a OnAir (para pasar a falling_idle), no quedarse en la pose de impulso.
      this.isPlayingTransient = true;
      resolved.animation.play(false);
      resolved.animation.onAnimationGroupEndObservable.addOnce(() => {
        this.isPlayingTransient = false;
        this._render(this.standAloneFsm.getActiveSubState());
      });
    } else {
      resolved.animation.play(resolved.loop);
    }
  }

  private _resolve(state: ResolvedStandAloneState): { animation: AnimationGroup; loop: boolean; waitForCompletion?: boolean } | null {
    if (!this.animations) return null;

    if (this.isAiming()) {
      if (state === "Idle" && this.animations.idle_aimming) {
        return { animation: this.animations.idle_aimming, loop: true };
      }
      if (state === "Walking" && this.animations.walking_aimming) {
        return { animation: this.animations.walking_aimming, loop: true };
      }
      if (state === "WalkingBackwards" && this.animations.walking_backwards_aimming) {
        return { animation: this.animations.walking_backwards_aimming, loop: true };
      }
      if (state === "Running" && this.animations.running_aimming) {
        return { animation: this.animations.running_aimming, loop: true };
      }
      // NUEVO — sin clips dedicados todavía, cae al switch de abajo (placeholders normales de crouch)
      if (state === "CrouchIdle" && this.animations.crouch_idle_aim) {
        return { animation: this.animations.crouch_idle_aim, loop: true };
      }
      if (state === "CrouchWalking" && this.animations.crouch_walk_aim) {
        return { animation: this.animations.crouch_walk_aim, loop: true };
      }
      if (state === "CrouchWalkingBackwards" && this.animations.crouch_walkbackwards_aim) {
        return { animation: this.animations.crouch_walkbackwards_aim, loop: true };
      }
    }

    switch (state) {
      case "Idle":
        return { animation: this.animations.standing_idle, loop: true };
      case "Walking":
        return { animation: this.animations.walking_forward, loop: true };
      case "WalkingBackwards":
        return { animation: this.animations.walking_backwards, loop: true };
      case "Running":
        return { animation: this.animations.running_normal, loop: true };
      case "ShootingStrafeLeft":
        return { animation: this.animations.strafe_left ?? this.animations.walking_forward, loop: true };
      case "ShootingStrafeRight":
        return { animation: this.animations.strafe_right ?? this.animations.walking_forward, loop: true };
      case "EquippingHoverBoardStart":
        return { animation: this.animations.jump_on_board, loop: false };
      case "JumpImpulseStart":
        return { animation: this.animations.jump, loop: false };
      case "RunningJumpImpulseStart":
        return { animation: this.animations.jump_while_running, loop: false, waitForCompletion: true };
      case "OnAir":
        return { animation: this.animations.falling_idle, loop: true };
      case "LandingSoft":
        return { animation: this.animations.normal_landing, loop: false };
      case "LandingRoll":
        return { animation: this.animations.roll_landing, loop: false };
      case "LandingCrash":
        return { animation: this.animations.crash_landing, loop: false };
      case "CrouchIdle": 
        return { animation: this.animations.cruising_maxVel_idle, loop: true };
      case "CrouchWalking": 
        return { animation: this.animations.crouch_walk, loop: true };
      case "CrouchWalkingBackwards": 
        return { animation: this.animations.crouch_walkbackwards, loop: true };
      default:
        return null;
    }
  }
}