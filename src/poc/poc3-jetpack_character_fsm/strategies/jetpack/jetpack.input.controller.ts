// src/poc3-jetpack_character_fsm/strategies/jetpack/jetpack.input.controller.ts
import type { IInputController } from "../contracts/iinput-controller";
import type { CharacterFsm } from "../../character-fsm/character.fsm";
import type { CharacterInput } from "../../character.input";

/**
 * El empuje (Space/`up`) lo lee directo JetpackPhysicsController. Acá sólo se traduce lo
 * que dispara una TRANSICIÓN: Ctrl mientras Jetpack está activo pide volver a StandAlone
 * (misma tecla física que "equipar" en StandAloneInputController — el mismo Ctrl significa
 * cosas distintas según qué input controller esté activo).
 */
export class JetpackInputController implements IInputController {
  constructor(
    private input: CharacterInput,
    private characterFsm: CharacterFsm,
  ) {}

  tick(): void {
    if (this.input.consumeEquipJetpackRequest()) {
      this.characterFsm.requestUnequipJetpack();
    }
  }

  dispose(): void {}
}