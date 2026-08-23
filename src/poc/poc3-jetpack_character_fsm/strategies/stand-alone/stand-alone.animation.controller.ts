// src/poc3-jetpack_character_fsm/strategies/stand-alone/stand-alone.animation.controller.ts
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { ICharacterAnimations } from "@/services/assets-manager";
import type { IAnimationController } from "../contracts/ianimation-controller";
import type { StandAloneFsm, StandAloneSubState } from "../../character-fsm/character.fsm.stand-alone";

/**
 * Recibe la sub-fsm por constructor (referencia directa, NO closures) — mismo patrón que
 * SkaterAnimator en poc2 (`private fsm: BoardFsm`), y misma relación que ya tiene
 * StandAloneInputController con CharacterFsm. Esto es lo que faltaba: sin esta referencia
 * no había forma de leer sub-estados ni, a futuro, de notificar de vuelta a la fsm (ej.
 * un equivalente a notifyJumpImpulseFrame() si algún día StandAlone tiene una animación
 * transient bloqueante).
 *
 * Suscripción a onStateChange + render inicial explícito, mismo criterio que
 * character.hud.ts / board.hud.ts (onStateChange no dispara para el estado con el que la
 * fsm ya arrancó).
 */
export class StandAloneAnimationController implements IAnimationController {
  private currentAnimation: AnimationGroup | null = null;

  constructor(
    private animations: ICharacterAnimations | null,
    private standAloneFsm: StandAloneFsm,
  ) {
    this.standAloneFsm.onStateChange((state) => this._render(state));
    this._render(this.standAloneFsm.getState());
  }

  /** Nada por frame todavía — hoy todo pasa por onStateChange. Frame-based (ej. blend por velocidad) se agrega cuando haga falta. */
  tick(): void {}

  dispose(): void {
    // No dispone `animations` (compartido, dueño: character.base.ts) — sólo pausa lo que
    // esta strategy dejó corriendo, para no pisarse con la próxima.
    this.currentAnimation?.stop();
  }

  private _render(state: StandAloneSubState): void {
    const animation = this._resolveAnimation(state);
    if (!animation || this.currentAnimation === animation) return;

    this.currentAnimation?.stop();
    this.currentAnimation = animation;
    animation.play(true); // loop
  }

  private _resolveAnimation(state: StandAloneSubState): AnimationGroup | null {
    if (!this.animations) return null;
    switch (state) {
      case "OnGround":
        return this.animations.standing_idle;
      default:
        return null;
    }
  }
}