import { BaseFsm, TransitionTable } from "../abstract/base-fsm";

/**
 * Sub-FSM de OnGround: Idle <-> Walking <-> Running.
 * A diferencia de JumpImpulseStart (edge-triggered vía requestJump()), estas transiciones
 * son level-triggered por input sostenido — mismo criterio que Jetpack Cruising (isCruiseHeld).
 */
export type OnGroundSubState = "Idle" | "Walking" | "Running";

export interface OnGroundFsmDeps {
  /** true mientras W o S está presionado */
  isMoveHeld: () => boolean;
  /** true mientras Shift está presionado */
  isRunHeld: () => boolean;
}

export class OnGroundFsm extends BaseFsm<OnGroundSubState> {
  protected transitions: TransitionTable<OnGroundSubState>;

  constructor(private deps: OnGroundFsmDeps) {
    super();
    this.state = "Idle"; // estado inicial: asignado directo, no vía setState

    this.transitions = {
      Idle: {
        Walking: () => this.deps.isMoveHeld(),
      },
      Walking: {
        Idle: () => !this.deps.isMoveHeld(),
        Running: () => this.deps.isMoveHeld() && this.deps.isRunHeld(),
      },
      Running: {
        // Sin W/S, Running no puede sostenerse aunque Shift siga presionado
        Idle: () => !this.deps.isMoveHeld(),
        Walking: () => this.deps.isMoveHeld() && !this.deps.isRunHeld(),
      },
    };
  }

  protected onEnter(_state: OnGroundSubState): void {}
  protected onExit(_state: OnGroundSubState): void {}
  dispose(): void {}
}
