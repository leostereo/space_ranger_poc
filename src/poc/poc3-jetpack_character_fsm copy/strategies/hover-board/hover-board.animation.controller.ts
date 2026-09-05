// src/poc4-.../strategies/hover-board/hover-board.animation.controller.ts
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { ICharacterAnimations } from "@/services/assets-manager";
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
    private animations: ICharacterAnimations | null,
    private boardFsm: BoardFsm,
  ) {
    this.boardFsm.onStateChange(() => this._render());
    this.boardFsm.hoveringSubFsm.onStateChange(() => this._render());
    this.boardFsm.fallingSubFsm.onStateChange(() => this._render());

    this._render();
  }

  tick(): void { }

  dispose(): void {
    this.currentAnimation?.stop();
  }

  private _render(): void {
    if (this.isPlayingTransient) return; // NUEVO: no interrumpe el jump mientras suena

    const macroState = this.boardFsm.getState();
    const subState = this.boardFsm.getActiveSubState();
    const resolved = this._resolve(macroState, subState);
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

  private _resolve(
    macroState: BoardMotionState,
    subState: HoveringSubState | FallingSubState,
  ): { animation: AnimationGroup; loop: boolean } | null {
    // sin cambios
    if (!this.animations) return null;

    if (macroState === "Hovering") {
      switch (subState as HoveringSubState) {
        case "CruisingIdle":
          return { animation: this.animations.standing_idle, loop: true };
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