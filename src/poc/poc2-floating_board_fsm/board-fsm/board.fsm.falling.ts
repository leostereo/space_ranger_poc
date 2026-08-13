// src/poc2-floating_board_fsm/board-fsm/board.fsm.falling.ts
import { BaseFsm, TransitionTable } from "../abstract/base-fsm";

export type FallingSubState = "Gliding" | "Diving" | "GliderBoost";

/** B1a — Falling: Gliding <-> Diving, ambos pueden boostear -> GliderBoost. */
export class BoardFsmFalling extends BaseFsm<FallingSubState> {
  protected transitions: TransitionTable<FallingSubState>;

  constructor(
    /** true mientras el input de pitchDown está presionado */
    private isPitchDownHeld: () => boolean,
    /** true cuando el impulso + pitch-kick del boost ya se asentaron */
    private isBoostSettled: () => boolean,
    private onEnterDiving: () => void,
    private onEnterGliderBoost: () => void,
  ) {
    super();
    this.state = "Gliding";

    this.transitions = {
      Gliding: {
        Diving: () => this.isPitchDownHeld(),
        GliderBoost: true,
      },
      Diving: {
        Gliding: () => !this.isPitchDownHeld(),
        GliderBoost: true, // se puede boostear en pleno picado
      },
      GliderBoost: {
        GliderBoost: true, // self, permite encadenar boosts (decae vía glideBoostChain)
        Gliding: () => this.isBoostSettled() && !this.isPitchDownHeld(),
        Diving: () => this.isBoostSettled() && this.isPitchDownHeld(),
      },
    };
  }

  /** Llamar desde el input handler cuando se presiona Space estando en Falling. */
  requestBoost(): void {
    this.setState("GliderBoost");
  }

  protected onEnter(state: FallingSubState): void {
    if (state === "Diving") this.onEnterDiving();
    if (state === "GliderBoost") this.onEnterGliderBoost();
  }

  protected onExit(_state: FallingSubState): void {}

  dispose(): void {}
}