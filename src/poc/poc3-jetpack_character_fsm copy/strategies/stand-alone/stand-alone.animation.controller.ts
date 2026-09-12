// stand-alone.animation.controller.ts
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { ICharacterAnimations } from "@/services/assets-manager";
import type { IAnimationController } from "../contracts/ianimation-controller";
import type { StandAloneFsm } from "../../character-fsm/character.fsm.stand-alone";
import type { OnGroundSubState } from "../../character-fsm/character.fsm.stand-alone.on-ground";

/** Combina el estado flat de StandAloneFsm con el sub-estado real de OnGroundFsm cuando aplica —
 * mismo valor que devuelve StandAloneFsm.getActiveSubState(). */
type ResolvedStandAloneState = OnGroundSubState | "JumpImpulseStart" | "OnAir";

export class StandAloneAnimationController implements IAnimationController {
  private currentAnimation: AnimationGroup | null = null;

  constructor(
    private animations: ICharacterAnimations | null,
    private standAloneFsm: StandAloneFsm,
    private isAiming: () => boolean, // NUEVO
  ) {
    this.standAloneFsm.onStateChange(() => this._render(this.standAloneFsm.getActiveSubState()));
    this.standAloneFsm.onGroundSubFsm.onStateChange(() => this._render(this.standAloneFsm.getActiveSubState()));
    this._render(this.standAloneFsm.getActiveSubState());

    if(this.animations){
      this.animations.normal_landing.from = 20;
      this.animations.normal_landing.speedRatio = 1.6;
      this.animations.crash_landing.from = 20;
      this.animations.roll_landing.from = 10;
      this.animations.roll_landing.speedRatio = 1.6;
    }
  }

  tick(): void {
    this._render(this.standAloneFsm.getActiveSubState());
  }

  dispose(): void {
    this.currentAnimation?.stop();
  }

  private _render(state: ResolvedStandAloneState): void {
    const resolved = this._resolve(state);
    if (!resolved || this.currentAnimation === resolved.animation) return;

    this.currentAnimation?.stop();
    this.currentAnimation = resolved.animation;
    resolved.animation.play(resolved.loop);
  }

  private _resolve(state: ResolvedStandAloneState): { animation: AnimationGroup; loop: boolean } | null {
    if (!this.animations) return null;

    // NUEVO — preparado para cuando subas aiming_idle/aiming_walking/aiming_running.
    // Mientras no existan (undefined), cae al switch normal de abajo sin romper nada.
    if (this.isAiming()) {
      if (state === "Idle" && this.animations.standing_idle) {
        return { animation: this.animations.standing_idle, loop: true };
      }
      if (state === "Walking" && this.animations.standing_idle) {
        return { animation: this.animations.standing_idle, loop: true };
      }
      if (state === "Running" && this.animations.standing_idle) {
        return { animation: this.animations.standing_idle, loop: true };
      }
    }

    switch (state) {
      case "Idle":
        return { animation: this.animations.standing_idle, loop: true };
      case "Walking":
        return { animation: this.animations.walking_forward, loop: true };
      case "Running":
        return { animation: this.animations.running_normal, loop: true };
      case "EquippingHoverBoardStart":
        return { animation: this.animations.jump_on_board, loop: false };
      case "JumpImpulseStart":
        return { animation: this.animations.jump, loop: false };
      case "OnAir":
        return { animation: this.animations.falling_idle, loop: true };
      case "LandingSoft":
        return { animation: this.animations.normal_landing, loop: false };
      case "LandingRoll":
        return { animation: this.animations.roll_landing, loop: false };
      case "LandingCrash":
        return { animation: this.animations.crash_landing, loop: false };
      default:
        return null;
    }
  }
}