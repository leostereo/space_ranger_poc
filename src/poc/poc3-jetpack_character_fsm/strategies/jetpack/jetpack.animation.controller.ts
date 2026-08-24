// src/poc3-jetpack_character_fsm/strategies/jetpack/jetpack.animation.controller.ts
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { ICharacterAnimations } from "@/services/assets-manager";
import type { IAnimationController } from "../contracts/ianimation-controller";
import type { JetpackFsm, JetpackSubState } from "../../character-fsm/character.fsm.jetpack";

/** Mismo patrón que StandAloneAnimationController — ver comentario ahí para el porqué. */
export class JetpackAnimationController implements IAnimationController {
  private currentAnimation: AnimationGroup | null = null;

  constructor(
    private animations: ICharacterAnimations | null,
    private jetpackFsm: JetpackFsm,
  ) {
    this.jetpackFsm.onStateChange((state) => this._render(state));
    this._render(this.jetpackFsm.getState());
  }

  tick(): void {}

  dispose(): void {
    this.currentAnimation?.stop();
  }

  private _render(state: JetpackSubState): void {
    const animation = this._resolveAnimation(state);
    if (!animation || this.currentAnimation === animation) return;

    this.currentAnimation?.stop();
    this.currentAnimation = animation;
    animation.play(true);
  }

  private _resolveAnimation(state: JetpackSubState): AnimationGroup | null {
    if (!this.animations) return null;
    switch (state) {
      case "On":
        // TODO: placeholder — el GLB actual no tiene clip de jetpack, "falling" es lo más
        // cercano semánticamente a "en el aire" del set actual (ver assets-manager.ts).
        return this.animations.cruising_forward_idle;
      default:
        return null;
    }
  }
}