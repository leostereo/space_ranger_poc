import type { IInputController } from "../contracts/iinput-controller";
import type { CharacterFsm } from "../../character-fsm/character.fsm";
import type { CharacterInput } from "../../character.input";

/**
 * Traduce input crudo -> acción de fsm para el estado StandAlone. El movimiento (WASD) lo
 * lee directo el physics controller — acá sólo se traduce lo que dispara una TRANSICIÓN.
 */
export class StandAloneInputController implements IInputController {
  constructor(
    private input: CharacterInput,
    private characterFsm: CharacterFsm,
  ) {}

  tick(): void {
    if (this.input.consumeEquipRequest()) {
      this.characterFsm.requestEquipment();
    }
    if (this.input.consumeJumpRequest()) {
      this.characterFsm.standAloneSubFsm.requestJump();
    }
  }

  dispose(): void {}
}
