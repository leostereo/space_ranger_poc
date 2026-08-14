import {
  type Scene,
  type AnimationGroup,
} from "@babylonjs/core";
import { AssetManager } from "@/services/assets-manager";
import { BoardFsm } from "../board-fsm/board.fsm";


export interface ISkaterAnimations {

    standing_idle: AnimationGroup;
    cruising_forward_idle: AnimationGroup;
    cruising_faster_idle: AnimationGroup;
    standing_to_crouch: AnimationGroup;
    crouch_to_standing: AnimationGroup;
    jump: AnimationGroup;
    falling: AnimationGroup;
}

export class SkaterAnimator {

  private currentAnimation: AnimationGroup | null = null;
  private animations: ISkaterAnimations | null = null;

  constructor(
    private scene: Scene,
    private fsm: BoardFsm,
  ) {
    this.setupAnimations();
    this.subscribeToFSM();
    this.playLoop(this.animations?.standing_idle!)
  }


  // ─────────────────────────────────────────────
  //  ANIMACIONES
  // ─────────────────────────────────────────────
  private setupAnimations(): void {

    const groups:AnimationGroup[] = AssetManager.getAnimations('character')

    const find = (name: string): AnimationGroup | undefined =>
      groups.find(g => g.name === `${name}`);
    //   groups.find(g => g.name === `${name}_${this.uniqueId}`);

    const standing_idle =  find("standing idle");
    const cruising_forward_idle =  find("skate_idle");
    const cruising_faster_idle =  find("ninja crouch idle mirror");
    const standing_to_crouch =  find("skate standing to crouch");
    const crouch_to_standing =  find("skate crouch to standing");
    const jump =  find("skate standing to jump");
    const falling =  find("skate falling to landing");

    if (!standing_idle || !cruising_forward_idle || !cruising_faster_idle ||
      !standing_to_crouch || !crouch_to_standing || !jump || !falling ){
      console.warn("Faltan animaciones");
      return;
    }

    // hit_reaction.from = 40;
    // hit_reaction.to = 100;
    // defeated.from = 15;
    // death_back.from  = 50;
    // death_forward.from = 80;
     
    this.animations = {
      standing_idle,
      cruising_forward_idle,
      cruising_faster_idle,
      standing_to_crouch,
      crouch_to_standing,
      jump,
      falling,
    };

    groups.forEach(g => g.stop());
    
  }

  private subscribeToFSM(): void {
    this.fsm.onStateChange((state) => this.onStateChanged(state));
  }

  private onStateChanged(state: ReturnType<BoardFsm["getState"]>): void {
    if (!this.animations) return;

    switch (state) {
      case "Falling":
        this.playLoop(this.animations.standing_idle);
        break;
      case "Hovering":
        this.playLoop(this.animations.cruising_forward_idle);
        break;
    }
  }

  private playLoop(animation: AnimationGroup): void {
    if (this.currentAnimation === animation) return;
    this.currentAnimation?.stop();
    this.currentAnimation = animation;
    animation.play(true);
  }

  private playOnce(animation: AnimationGroup, onEnd: () => void): void {
    this.currentAnimation?.stop();
    this.currentAnimation = animation;
    animation.play(false);
    animation.onAnimationGroupEndObservable.addOnce(() => onEnd());
  }


  dispose(): void {
    this.currentAnimation?.stop();
    this.animations = null;
  }
}