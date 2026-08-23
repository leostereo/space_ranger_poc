// src/poc3-jetpack_character_fsm/strategies/no-vehicle/no-vehicle.input.controller.ts
import type { IInputController } from "../contracts/iinput-controller";
import type { CharacterFsm } from "../../character-fsm/character.fsm";
import type { CharacterInput } from "../../character.input";

/**
 * Traduce input crudo -> acción de fsm para el estado NoVehicle. El movimiento (WASD) lo
 * lee directo el physics controller — acá sólo se traduce lo que dispara una TRANSICIÓN.
 */
export class NoVehicleInputController implements IInputController {
  constructor(
    private input: CharacterInput,
    private characterFsm: CharacterFsm,
  ) {}

  tick(): void {
    if (this.input.consumeEquipJetpackRequest()) {
      this.characterFsm.requestEquipJetpack();
    }
  }

  dispose(): void {}
}
