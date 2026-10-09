// src/poc4-.../strategies/hover-board/hover-board.input.controller.ts
import type { IInputController } from "../contracts/iinput-controller";
import type { CharacterFsm } from "../../character-fsm/character.fsm";
import type { CharacterInput } from "../../character.input";

/**
 * Traduce input crudo -> transición mientras HoverBoard está activo.
 * Space -> jump (delegado a boardSubFsm.requestJump(), mismo patrón que
 * BoardFsm.requestJump() en POC2). Ctrl -> desequipar (mismo flag reusado que
 * Standalone/Jetpack, mismo criterio: "el mismo Ctrl significa cosas distintas
 * según qué input controller esté activo").
 */
export class HoverBoardInputController implements IInputController {
  constructor(
    private input: CharacterInput,
    private characterFsm: CharacterFsm,
  ) {}

  tick(): void {
    if (this.input.consumeJumpRequest()) {
      this.characterFsm.boardSubFsm.requestJump();
    }
    if (this.input.consumeEquipRequest()) {
      this.characterFsm.requestUnequipBoard();
    }
  }

  dispose(): void {}
}