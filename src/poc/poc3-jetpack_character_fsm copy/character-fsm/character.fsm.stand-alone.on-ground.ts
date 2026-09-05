import { BaseFsm, TransitionTable } from "../abstract/base-fsm";

export type OnGroundSubState = "Idle" | "Walking" | "Running" | "EquippingHoverBoardStart";

export interface OnGroundFsmDeps {
  isMoveHeld: () => boolean;
  isRunHeld: () => boolean;
}

export class OnGroundFsm extends BaseFsm<OnGroundSubState> {
  protected transitions: TransitionTable<OnGroundSubState>;

  constructor(private deps: OnGroundFsmDeps) {
    super();
    this.state = "Idle";

    this.transitions = {
      Idle: {
        Walking: () => this.deps.isMoveHeld(),
      },
      Walking: {
        Idle: () => !this.deps.isMoveHeld(),
        Running: () => this.deps.isMoveHeld() && this.deps.isRunHeld(),
      },
      Running: {
        Idle: () => !this.deps.isMoveHeld(),
        Walking: () => this.deps.isMoveHeld() && !this.deps.isRunHeld(),
        EquippingHoverBoardStart: true, // vía requestEquipHoverBoard(), edge-triggered
      },
      // Bridge — nunca sale sola en tick(), sólo vía notifyEquipAnimationFrame(),
      // mismo patrón que JumpImpulseStart -> OnAir en StandAloneFsm.
      EquippingHoverBoardStart: {
        Idle: true, // destino irrelevante en la práctica: el sub-FSM entero se destruye
                    // al hacer el swap de strategy a HoverBoard.
      },
    };
  }

  /** Único punto de entrada — sólo tiene efecto si estás en Running. */
  requestEquipHoverBoard(): void {
    if (this.state === "Running") {
      this.setState("EquippingHoverBoardStart");
    }
  }

  /** Llamado por el AnimationEvent del clip "jump_on_board" al llegar al frame clave. */
  notifyEquipAnimationFrame(): void {
    if (this.state === "EquippingHoverBoardStart") {
      this.setState("Idle");
    }
  }

  protected onEnter(_state: OnGroundSubState): void {}
  protected onExit(_state: OnGroundSubState): void {}
  dispose(): void {}
}