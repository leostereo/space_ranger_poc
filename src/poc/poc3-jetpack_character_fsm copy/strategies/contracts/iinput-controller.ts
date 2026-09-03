// src/poc3-jetpack_character_fsm/strategies/contracts/iinput-controller.ts

/**
 * Capa de "interpretación" de input por estado. El input crudo (captura de teclas) es
 * único y vive en character.input.ts — esto es lo que traduce ese input crudo a acciones
 * concretas de la fsm/física para el estado principal activo (equivalente, en poc2, a lo
 * que hacía BoardController.update() mezclado con la física: `if (consumeJumpRequest())
 * fsm.requestJump()`; acá se separa en su propia clase).
 */
export interface IInputController {
  tick(): void;
  dispose(): void;
}
