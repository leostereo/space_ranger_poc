import { BaseFsm, TransitionTable } from "../abstract/base-fsm";
import { OnGroundFsm, type OnGroundSubState } from "./character.fsm.stand-alone.on-ground";

/**
 * A — A pie. `OnLadder` (roadmap original) queda para más adelante.
 * OnGround ahora es un sub-FSM propio (Idle/Walking/Running) en vez de un estado flat —
 * ver character.fsm.stand-alone.on-ground.ts.
 * Salto: OnGround -> JumpImpulseStart -> OnAir -> OnGround, mismo patrón puente que
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
  /** Threading hacia OnGroundFsmDeps, mismo criterio que isGroundDetected/onEnterOnAir. */
  isMoveHeld: () => boolean;
  isRunHeld: () => boolean;
}

export class StandAloneFsm extends BaseFsm<StandAloneSubState> {
  protected transitions: TransitionTable<StandAloneSubState>;

  readonly onGroundSubFsm: OnGroundFsm;

  constructor(private deps: StandAloneFsmDeps) {
    super();
    this.state = "OnGround"; // estado inicial: asignado directo, no vía setState

    this.onGroundSubFsm = new OnGroundFsm({
      isMoveHeld: this.deps.isMoveHeld,
      isRunHeld: this.deps.isRunHeld,
    });

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

  /** Le da cuerda al sub-FSM de OnGround mientras ese sea el estado activo. */
  public override tick(): void {
    super.tick();
    if (this.state === "OnGround") {
      this.onGroundSubFsm.tick();
    }
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

  /** Para el HUD/CharacterFsm: expone el sub-estado real de OnGround en vez del flat "OnGround". */
  getActiveSubState(): OnGroundSubState | "JumpImpulseStart" | "OnAir" {
    return this.state === "OnGround" ? this.onGroundSubFsm.getState() : this.state;
  }

  protected onEnter(state: StandAloneSubState): void {
    if (state === "OnAir") this.deps.onEnterOnAir();
  }

  protected onExit(_state: StandAloneSubState): void {}

  dispose(): void {
    this.onGroundSubFsm.dispose();
  }
}
