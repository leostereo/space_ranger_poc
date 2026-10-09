// src/poc4-.../strategies/hover-board/hover-board.animation.controller.ts
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { CharacterAnimationSet } from "@/game/assets/animations/character-clip-names";
import type { IAnimationController } from "../contracts/ianimation-controller";
import type { BoardFsm, BoardMotionState } from "../../character-fsm/board-fsm/board.fsm";
import type { HoveringSubState } from "../../character-fsm/board-fsm/board.fsm.hovering";
import type { FallingSubState } from "../../character-fsm/board-fsm/board.fsm.falling";

/**
 * Portado de SkaterAnimator (POC2), pero por suscripción a onStateChange en vez de
 * polling en update() — mismo criterio que StandAloneAnimationController. Respeta el
 * mismo switch de mapeo estado->clip que tenía SkaterAnimator.
 */
export class HoverBoardAnimationController implements IAnimationController {
  private currentAnimation: AnimationGroup | null = null;
  private isPlayingTransient = false; // NUEVO

  constructor(
    private animations: CharacterAnimationSet | null,
    private boardFsm: BoardFsm,
    private isAiming: () => boolean,
    private isShielding: () => boolean, // NUEVO

  ) {
    this.boardFsm.onStateChange(() => this._render());
    this.boardFsm.hoveringSubFsm.onStateChange(() => this._render());
    this.boardFsm.fallingSubFsm.onStateChange(() => this._render());

    // NUEVO — reacción al hit y muerte (el FSM avisa, el clip lo decide este controller)
    this.boardFsm.onHitReactionObservable.add(() => this._playHitReaction());
    this.boardFsm.onDeathObservable.add(() => this._playDeath());

    this._render();
  }

  tick(): void {
    this._render();
  }

  dispose(): void {
    this.currentAnimation?.stop();
  }

  private _render(): void {
    if (this.isPlayingTransient) return;

    const macroState = this.boardFsm.getState();
    const subState = this.boardFsm.getActiveSubState();

    // NUEVO — placeholder, mismo criterio que StandAloneAnimationController: mientras
    // aiming_idle no exista todavía en el GLB, cae al _resolve() normal de abajo sin
    // romper nada. Un solo clip de apuntado para todo el board por ahora (no hay
    // distinción de sub-estados de movimiento como Walking/Running en StandAlone).
    let resolved: { animation: AnimationGroup; loop: boolean } | null;
    if (this.isShielding() && this.animations?.shield_idle_crouched) {
      resolved = { animation: this.animations.shield_idle_crouched, loop: true };
    } else if (this.isAiming() && this.animations?.crouch_aiming) {
      resolved = { animation: this.animations.crouch_aiming, loop: true };
    } else {
      resolved = this._resolve(macroState, subState);
    }

    if (!resolved || this.currentAnimation === resolved.animation) return;

    this.currentAnimation?.stop();
    this.currentAnimation = resolved.animation;

    if (!resolved.loop) {
      // NUEVO: mismo criterio que playTransient() de POC2
      this.isPlayingTransient = true;
      resolved.animation.play(false);
      resolved.animation.onAnimationGroupEndObservable.addOnce(() => {
        this.isPlayingTransient = false;
      });
    } else {
      resolved.animation.play(true);
    }
  }

  /**
   * NUEVO — reacción al hit: pisa la locomoción hasta que termina el clip. Sin freno en el board:
   * la física sigue normal, sólo cambia lo que se ve. Al terminar libera el flag del FSM.
   */
  private _playHitReaction(): void {
    const clip = this.animations?.hit_reaction_crouched;
    if (!clip) {
      // sin clip no hay a qué esperar: liberamos la reacción enseguida
      this.boardFsm.notifyHitReactionComplete();
      return;
    }

    this.currentAnimation?.stop();
    this.currentAnimation = clip;
    this.isPlayingTransient = true; // _render queda en pausa hasta que termine

    clip.play(false);
    clip.onAnimationGroupEndObservable.addOnce(() => {
      this.isPlayingTransient = false;
      this.boardFsm.notifyHitReactionComplete();
      this._render(); // retoma la locomoción del estado actual
    });
  }

  /** NUEVO — muerte: clip terminal, _render queda bloqueado para siempre. */
  private _playDeath(): void {
    const clip = this.animations?.death_hoverBoard;

    this.currentAnimation?.stop();
    this.isPlayingTransient = true; // nunca se resetea: no hay vuelta atrás
    if (!clip) return;

    this.currentAnimation = clip;
    clip.play(false);
  }

  private _resolve(
    macroState: BoardMotionState,
    subState: HoveringSubState | FallingSubState,
  ): { animation: AnimationGroup; loop: boolean } | null {
    // sin cambios
    if (!this.animations) return null;

    if (macroState === "Hovering") {
      switch (subState as HoveringSubState) {
        case "CruisingIdle":
          return { animation: this.animations.cruising_idle, loop: true };
        case "CruisingFast":
          return { animation: this.animations.cruising_forward_idle, loop: true };
        case "CruisingVeryFast":
          return { animation: this.animations.cruising_faster_idle, loop: true };
        case "JumpImpulseStart":
          return { animation: this.animations.jump, loop: false };
        case "Jumping":
          return null;
        default:
          return null;
      }
    }

    switch (subState as FallingSubState) {
      case "GliderBoost":
        return { animation: this.animations.jump, loop: true };
      case "Diving":
        return { animation: this.animations.cruising_faster_idle, loop: true };
      case "Gliding":
        return { animation: this.animations.cruising_forward_idle, loop: true };
      case "Dropping":
      default:
        return { animation: this.animations.standing_idle, loop: true };
    }
  }
}