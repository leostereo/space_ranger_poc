// src/poc2-floating_board_fsm/board-fsm/board.fsm.falling.ts
import { BaseFsm, TransitionTable } from "../../abstract/base-fsm";

// ✨ Agregamos "Dropping" a la lista de sub-estados
export type FallingSubState = "Dropping" | "Gliding" | "Diving" | "GliderBoost";

/** B1a — Falling: Dropping <-> Gliding <-> Diving, todos pueden boostear -> GliderBoost. */
export class BoardFsmFalling extends BaseFsm<FallingSubState> {
  protected transitions: TransitionTable<FallingSubState>;

  constructor(
    /** ✨ true mientras el input de avanzar (forward) está presionado */
    private isForwardHeld: () => boolean,
    /** true mientras el input de pitchDown está presionado */
    private isPitchDownHeld: () => boolean,
    /** true cuando el impulso + pitch-kick del boost ya se asentaron */
    private isBoostSettled: () => boolean,
    private onEnterDiving: () => void,
    private onEnterGliderBoost: () => void,
  ) {
    super();
    // Estado inicial al entrar al aire: Dropping (caída libre por defecto)
    this.state = "Dropping";

    this.transitions = {
      // -----------------------------------------------------------------
      // ✨ NUEVO ESTADO: Caída libre sin empuje
      // -----------------------------------------------------------------
      Dropping: {
        Diving: () => this.isPitchDownHeld(), // Prioridad absoluta: Picada
        Gliding: () => this.isForwardHeld() && !this.isPitchDownHeld(), // Activa motor
        GliderBoost: true,
      },

      // -----------------------------------------------------------------
      // ESTADO ACTUALIZADO: Planeo activo con acelerador
      // -----------------------------------------------------------------
      Gliding: {
        Diving: () => this.isPitchDownHeld(), // Prioridad absoluta: Picada
        Dropping: () => !this.isForwardHeld(), // Suelta acelerador: cae sin empuje
        GliderBoost: true,
      },

      // -----------------------------------------------------------------
      // ESTADO ACTUALIZADO: Picado extremo
      // -----------------------------------------------------------------
      Diving: {
        // Al soltar la picada, evalúa si debe planear o caer muerto
        Gliding: () => !this.isPitchDownHeld() && this.isForwardHeld(),
        Dropping: () => !this.isPitchDownHeld() && !this.isForwardHeld(),
        GliderBoost: true,
      },

      // -----------------------------------------------------------------
      // ESTADO ACTUALIZADO: Impulso aéreo
      // -----------------------------------------------------------------
      GliderBoost: {
        GliderBoost: true, // Permite encadenar boosts como antes
        // Al asentarse el boost, decide el destino según la combinación de teclas
        Diving: () => this.isBoostSettled() && this.isPitchDownHeld(),
        Gliding: () => this.isBoostSettled() && !this.isPitchDownHeld() && this.isForwardHeld(),
        Dropping: () => this.isBoostSettled() && !this.isPitchDownHeld() && !this.isForwardHeld(),
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
