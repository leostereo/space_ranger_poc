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
  ) {
    this.standAloneFsm.onStateChange(() => this._render(this.standAloneFsm.getActiveSubState()));
    // Nuevo — sin esto, Idle/Walking/Running (hijos de OnGround) nunca disparan re-render,
    // igual bug que tenía character.hud.ts antes de suscribirse a onGroundSubFsm.
    this.standAloneFsm.onGroundSubFsm.onStateChange(() => this._render(this.standAloneFsm.getActiveSubState()));

    this._render(this.standAloneFsm.getActiveSubState());
  }

  tick(): void {}

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
    switch (state) {
      case "Idle":
        return { animation: this.animations.standing_idle, loop: true };
      case "Walking":
        return { animation: this.animations.walking_forward, loop: true };
      case "Running":
        return { animation: this.animations.running_normal, loop: true };
      case "JumpImpulseStart":
        return { animation: this.animations.jump, loop: false };
      case "OnAir":
        return { animation: this.animations.falling_idle, loop: true };
      default:
        return null;
    }
  }
}