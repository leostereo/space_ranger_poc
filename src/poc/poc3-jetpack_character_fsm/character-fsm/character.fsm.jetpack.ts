// src/poc3-jetpack_character_fsm/character-fsm/character.fsm.jetpack.ts

import { BaseFsm, TransitionTable } from "../abstract/base-fsm";

/**
 * B2 — Jetpack. Alcance MÍNIMO para esta primera pasada: un solo estado `On`.
 * `Idle`/`Thrusting`/`Floating` (ver poc3.md, diagrama tentativo) quedan para cuando la
 * física básica de vuelo esté probada — mismo criterio que poc2 (Paso 4a: física mínima
 * sin input antes de sub-estados finos).
 */
export type JetpackSubState = "On";

export class JetpackFsm extends BaseFsm<JetpackSubState> {
  protected transitions: TransitionTable<JetpackSubState> = {
    On: {},
  };

  constructor() {
    super();
    this.state = "On";
  }

  protected onEnter(_state: JetpackSubState): void {}
  protected onExit(_state: JetpackSubState): void {}
  dispose(): void {}
}
