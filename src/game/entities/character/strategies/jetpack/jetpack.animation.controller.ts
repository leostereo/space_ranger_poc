// src/poc3-jetpack_character_fsm/strategies/jetpack/jetpack.animation.controller.ts
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { ICharacterAnimations } from "@/services/assets-manager";
import type { IAnimationController } from "../contracts/ianimation-controller";
import type { JetpackFsm, JetpackSubState } from "../../character-fsm/jetpack-fsm/character.fsm.jetpack";

/** Mismo patrón que StandAloneAnimationController — ver comentario ahí para el porqué. */
export class JetpackAnimationController implements IAnimationController {
  private currentAnimation: AnimationGroup | null = null;
  private isDead = false; // NUEVO — una vez muerto, _render queda bloqueado para siempre

  constructor(
    private animations: ICharacterAnimations | null,
    private jetpackFsm: JetpackFsm,
  ) {
    this.jetpackFsm.onStateChange((state) => this._render(state));
    this._render(this.jetpackFsm.getState());

    // NUEVO — muerte y aterrizaje del muerto (el FSM avisa, el clip lo decide este controller)
    this.jetpackFsm.onDeathObservable.add(() => this._playDeath());
    this.jetpackFsm.onDeadLandingObservable.add(() => this._playDeadLanding());
  }

  tick(): void {}

  dispose(): void {
    this.currentAnimation?.stop();
  }

  private _render(state: JetpackSubState): void {
    if (this.isDead) return; // NUEVO

    const animation = this._resolveAnimation(state);
    if (!animation || this.currentAnimation === animation) return;

    this.currentAnimation?.stop();
    this.currentAnimation = animation;
    animation.play(true);
  }

  /** NUEVO — muerte en jetpack: mismo clip que standAlone>onAir. */
  private _playDeath(): void {
    this.isDead = true;
    this.currentAnimation?.stop();

    const clip = this.animations?.death_onAir;
    if (!clip) return;

    this.currentAnimation = clip;
    clip.play(false);
  }

  /** NUEVO — el muerto toca el piso: cambia el clip de muerte por el de aterrizaje (temporal: crash_landing). */
  private _playDeadLanding(): void {
    const clip = this.animations?.death_onAir_landing;
    if (!clip) return;

    this.currentAnimation?.stop();
    this.currentAnimation = clip;
    clip.play(false);
  }

  private _resolveAnimation(state: JetpackSubState): AnimationGroup | null {
    if (!this.animations) return null;
    switch (state) {
      case "On":
        // TODO: placeholder — el GLB actual no tiene clip de jetpack, "falling" es lo más
        // cercano semánticamente a "en el aire" del set actual (ver assets-manager.ts).
        return this.animations.floating;
      case "Cruising":
        return this.animations.flying;
      case "Shooting":
        return this.animations.aiming_jetpack;
      default:
        return null;
    }
  }
}