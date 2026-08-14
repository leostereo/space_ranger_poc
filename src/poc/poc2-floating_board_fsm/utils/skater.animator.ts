// src/poc2-floating_board_fsm/animator/skater-animator.ts
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
  cruising_maxVel_idle: AnimationGroup;
  standing_to_crouch: AnimationGroup;
  crouch_to_standing: AnimationGroup;
  jump: AnimationGroup;
  falling: AnimationGroup;
}

export class SkaterAnimator {
  private currentAnimation: AnimationGroup | null = null;
  private animations: ISkaterAnimations | null = null;
  
  // Flag para bloquear interrupciones de bucle mientras corre una animación única (ej: Salto)
  private isPlayingTransient = false; 

  constructor(
    private scene: Scene,
    private fsm: BoardFsm,
  ) {
    this.setupAnimations();
    
    // En lugar de suscribirnos solo al evento macro, registramos un observer en el loop de Babylon
    // para que el animator chequee el sub-estado activo de la FSM en cada frame.

  }

  private setupAnimations(): void {
    const groups: AnimationGroup[] = AssetManager.getAnimations('character');
console.log(groups)
    const find = (name: string): AnimationGroup | undefined =>
      groups.find(g => g.name === name);

    const standing_idle = find("standing idle");
    const cruising_forward_idle = find("skate_idle");
    const cruising_faster_idle = find("ninja crouch idle mirror");
    const cruising_maxVel_idle = find("skate crouching idle");
    const standing_to_crouch = find("skate standing to crouch");
    const crouch_to_standing = find("skate crouch to standing");
    const jump = find("skate standing to jump");
    const falling = find("skate falling to landing");

    if (!standing_idle || !cruising_forward_idle || !cruising_faster_idle || !cruising_maxVel_idle ||
      !standing_to_crouch || !crouch_to_standing || !jump || !falling) {
      console.warn("Faltan animaciones");
      return;
    }
     
    this.animations = {
      standing_idle,
      cruising_forward_idle,
      cruising_faster_idle,
      cruising_maxVel_idle,
      standing_to_crouch,
      crouch_to_standing,
      jump,
      falling,
    };

    groups.forEach(g => g.stop());
  }

  /**
   * Se ejecuta en cada frame antes de renderizar. 
   * Evalúa el estado de la FSM y elige el clip correcto si no hay transiciones bloqueantes.
   */
  public update(): void {
    if (!this.animations || this.isPlayingTransient) return;

    const macroState = this.fsm.getState();
    const subState = this.fsm.getActiveSubState();
    // =========================================================================
    // 🛹 1. EVALUACIÓN EN TIERRA (HOVERING)
    // =========================================================================
    if (macroState === "Hovering") {
      // Nota: Asumo que en Hovering tus sub-estados podrían llamarse "Cruising" o "Jumping".
      // Ajustá estos strings si en tu board.fsm.hovering.ts usás otros nombres.
      if (subState === "Jumping") {
        this.playTransient(this.animations.jump);
      } else {
        // Si está en tierra y moviéndose normal
        this.playLoop(this.animations.cruising_forward_idle);
      }
    } 
    // =========================================================================
    // 🪂 2. EVALUACIÓN EN EL AIRE (FALLING)
    // =========================================================================
    else if (macroState === "Falling") {
      switch (subState) {
        case "GliderBoost":
          // Cuando tira el impulso del salto, podemos usar la animación de jump
          this.playLoop(this.animations.jump); 
          break;

        case "Diving":
          // El picado extremo encaja perfecto con tu animación de agachado ninja/aerodinámico!
          this.playLoop(this.animations.cruising_maxVel_idle); 
          break;

        case "Gliding":
          // Planeando con motor: El skater va sobre la tabla equilibrándose
          this.playLoop(this.animations.cruising_faster_idle);
          break;

        case "Dropping":
        default:
          // Caída libre sin motor: Animación más estática o de emergencia
          this.playLoop(this.animations.standing_idle);
          break;
      }
    }
  }

  private playLoop(animation: AnimationGroup): void {
    if (this.currentAnimation === animation) return;
    this.currentAnimation?.stop();
    this.currentAnimation = animation;
    animation.play(true);
  }

  /**
   * Ejecuta una animación completa una sola vez (como el salto)
   * y bloquea las actualizaciones de los bucles hasta que termina.
   */
  private playTransient(animation: AnimationGroup): void {
    if (this.currentAnimation === animation) return;
    
    this.isPlayingTransient = true;
    this.currentAnimation?.stop();
    this.currentAnimation = animation;

    // Configuramos velocidad normal y que no repita en bucle
    animation.play(false); 
    
    animation.onAnimationGroupEndObservable.addOnce(() => {
      this.isPlayingTransient = false;
      // Al terminar, el próximo tick del update() restaurará el bucle correcto
    });
  }

  dispose(): void {
    this.currentAnimation?.stop();
    this.animations = null;
  }
}
