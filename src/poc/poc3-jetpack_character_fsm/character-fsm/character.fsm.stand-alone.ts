// src/poc3-jetpack_character_fsm/character-fsm/character.fsm.stand-alone.ts
import { BaseFsm, TransitionTable } from "../abstract/base-fsm";

/**
 * A — A pie. `OnLadder` (roadmap original) queda para más adelante. Se agrega el salto:
 * OnGround -> JumpImpulseStart -> OnAir -> OnGround, mismo patrón puente que
 * BoardFsmHovering (JumpImpulseStart -> Jumping) en poc2 — el estado puente nunca se
 * auto-dispara en tick(), sólo sale vía notifyJumpImpulseFrame(), llamado por quien
 * reproduce la animación de salto al llegar al frame de impulso.
 */
export type StandAloneSubState = "OnGround" | "JumpImpulseStart" | "OnAir";

export interface StandAloneFsmDeps {
  /** Vía raycast en el physics controller activo — ver stand-alone.physics.controller.ts. */
  isGroundDetected: () => boolean;
  /** Aplica el impulso físico del salto. Se dispara al ENTRAR a OnAir (frame de impulso), no al presionar la tecla. */
  onEnterOnAir: () => void;
}

export class StandAloneFsm extends BaseFsm<StandAloneSubState> {
  protected transitions: TransitionTable<StandAloneSubState>;

  constructor(private deps: StandAloneFsmDeps) {
    super();
    this.state = "OnGround"; // estado inicial: asignado directo, no vía setState

    this.transitions = {
      OnGround: {
        JumpImpulseStart: true, // vía requestJump()
      },
      JumpImpulseStart: {
        OnAir: true, // vía notifyJumpImpulseFrame(), manual — nunca automático en tick()
      },
      OnAir: {
        OnGround: () => this.deps.isGroundDetected(), // guard automático, mismo criterio que ground detection en poc2
      },
    };
  }

  /** Único punto de entrada de input — mismo patrón que requestJump() en BoardFsm. */
  requestJump(): void {
    if (this.state === "OnGround") {
      this.setState("JumpImpulseStart");
    }
  }

  /** Llamado por quien reproduce la animación de salto al llegar al frame de impulso (ver character.base.ts). */
  notifyJumpImpulseFrame(): void {
    if (this.state === "JumpImpulseStart") {
      this.setState("OnAir");
    }
  }

  protected onEnter(state: StandAloneSubState): void {
    if (state === "OnAir") this.deps.onEnterOnAir();
  }

  protected onExit(_state: StandAloneSubState): void {}
  dispose(): void {}
}