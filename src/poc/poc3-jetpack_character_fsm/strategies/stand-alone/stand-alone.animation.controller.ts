// src/poc3-jetpack_character_fsm/strategies/stand-alone/stand-alone.animation.controller.ts
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { ICharacterAnimations } from "@/services/assets-manager";
import type { IAnimationController } from "../contracts/ianimation-controller";
import type { StandAloneFsm, StandAloneSubState } from "../../character-fsm/character.fsm.stand-alone";

/**
 * Recibe la sub-fsm por constructor (referencia directa, NO closures) — mismo patrón que
 * SkaterAnimator en poc2 (`private fsm: BoardFsm`), y misma relación que ya tiene
 * StandAloneInputController con CharacterFsm. Esto es lo que permite leer sub-estados acá.
 * El otro sentido (animación -> fsm) — notifyJumpImpulseFrame() al llegar al frame de
 * impulso del salto — NO se registra acá: vive en character.base.ts, porque el
 * AnimationGroup de `jump` es compartido entre reconstrucciones de esta clase (ver
 * comentario en character.base.ts) y sólo puede registrarse una vez.
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
    const resolved = this._resolve(state);
    if (!resolved || this.currentAnimation === resolved.animation) return;

    this.currentAnimation?.stop();
    this.currentAnimation = resolved.animation;
    resolved.animation.play(resolved.loop);
  }

  private _resolve(state: StandAloneSubState): { animation: AnimationGroup; loop: boolean } | null {
    if (!this.animations) return null;
    switch (state) {
      case "OnGround":
        return { animation: this.animations.standing_idle, loop: true };
      case "JumpImpulseStart":
        // No loop: se reproduce una vez; el AnimationEvent (ver character.base.ts) dispara
        // notifyJumpImpulseFrame() al llegar al frame de impulso, independientemente de si
        // el clip terminó de reproducirse o no.
        return { animation: this.animations.jump, loop: false };
      case "OnAir":
        // TODO: placeholder — no hay clip de "en el aire a pie" en el GLB actual, se
        // reutiliza "falling" (misma solución temporal que en JetpackAnimationController).
        return { animation: this.animations.falling, loop: true };
      default:
        return null;
    }
  }
}