// src/poc2-floating_board_fsm/board-fsm/board.fsm.ts
import { BaseFsm, TransitionTable } from "../abstract/base-fsm";
import { BoardFsmHovering, type HoveringSubState } from "./board.fsm.hovering";
import { BoardFsmFalling, type FallingSubState } from "./board.fsm.falling";

export type BoardMotionState = "Hovering" | "Falling";

export interface BoardFsmDeps {
  // Hovering <-> Falling (padre)
  isGroundDetected: () => boolean;
  groundLostElapsed: () => number;
  coyoteTime: number;
  onEnterHovering: () => void;
  onEnterFalling: () => void;

  // Cruising <-> Jumping (hijo: Hovering)
  isJumpSettled: () => boolean;
  onEnterJumping: () => void;
  getForwardSpeed: () => number;  

 isForwardHeld: () => boolean; 

  // Gliding <-> Diving <-> GliderBoost (hijo: Falling)
  isPitchDownHeld: () => boolean;
  isBoostSettled: () => boolean;
  onEnterDiving: () => void;
  onEnterGliderBoost: () => void;
}

/** B1 — Skateboard: decide entre B1b (Hovering) y B1a (Falling), y gobierna a sus sub-FSMs. */
export class BoardFsm extends BaseFsm<BoardMotionState> {
  protected transitions: TransitionTable<BoardMotionState>;

  readonly hoveringSubFsm: BoardFsmHovering;
  readonly fallingSubFsm: BoardFsmFalling;

  constructor(private deps: BoardFsmDeps) {
    super();
    this.state = "Hovering"; // estado inicial: se asigna directo, no vía setState

    this.hoveringSubFsm = new BoardFsmHovering(
      this.deps.isJumpSettled,
      this.deps.onEnterJumping,
      this.deps.getForwardSpeed,
    );

    this.fallingSubFsm = new BoardFsmFalling(
      this.deps.isForwardHeld, 
      this.deps.isPitchDownHeld,
      this.deps.isBoostSettled,
      this.deps.onEnterDiving,
      this.deps.onEnterGliderBoost,
    );

    this.transitions = {
      Hovering: {
        Falling: () => !this.deps.isGroundDetected() && this.deps.groundLostElapsed() >= this.deps.coyoteTime,
      },
      Falling: {
        Hovering: () => this.deps.isGroundDetected(),
      },
    };
  }

  /** Ejecuta la transición padre y, según cuál quede activa, le da cuerda a la sub-FSM correspondiente. */
  public override tick(): void {
    super.tick();

    if (this.state === "Hovering") {
      this.hoveringSubFsm.tick();
    } else {
      this.fallingSubFsm.tick();
    }
  }

  /** Único punto de entrada de input para el controller: la FSM decide a qué hija delegar según su propio estado. */
  requestJump(): void {
    if (this.state === "Hovering") {
      this.hoveringSubFsm.requestJump();
    } else {
      this.fallingSubFsm.requestBoost();
    }
  }

  /** Para el HUD: evita que tenga que conocer hoveringSubFsm/fallingSubFsm por separado. */
  getActiveSubState(): HoveringSubState | FallingSubState {
    return this.state === "Hovering" ? this.hoveringSubFsm.getState() : this.fallingSubFsm.getState();
  }

  protected onEnter(state: BoardMotionState): void {
    if (state === "Hovering") this.deps.onEnterHovering();
    if (state === "Falling") this.deps.onEnterFalling();
  }

  protected onExit(_state: BoardMotionState): void {
    // sin side-effects por ahora
  }

  dispose(): void {
    this.hoveringSubFsm.dispose();
    this.fallingSubFsm.dispose();
  }
}