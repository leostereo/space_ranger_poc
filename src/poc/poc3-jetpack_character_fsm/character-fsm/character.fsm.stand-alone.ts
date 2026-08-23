// src/poc3-jetpack_character_fsm/character-fsm/character.fsm.stand-alone.ts

import { BaseFsm, TransitionTable } from "../abstract/base-fsm";

/**
 * A — A pie. Alcance MÍNIMO para esta primera pasada: sólo `OnGround`.
 * `OnAir`/`OnLadder` (roadmap original) quedan para el próximo incremento, una vez que
 * el esqueleto StandAlone <-> Jetpack funcione de punta a punta.
 */
export type StandAloneSubState = "OnGround";

export class StandAloneFsm extends BaseFsm<StandAloneSubState> {
  protected transitions: TransitionTable<StandAloneSubState> = {
    OnGround: {},
  };

  constructor() {
    super();
    this.state = "OnGround"; // estado inicial: asignado directo, no vía setState (mismo criterio que BoardFsm)
  }

  protected onEnter(_state: StandAloneSubState): void {}
  protected onExit(_state: StandAloneSubState): void {}
  dispose(): void {}
}
