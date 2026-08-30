import type { CharacterInput } from "../../character.input";
import type { BoardInputState } from "./board-fsm/board.input.contract"; // o donde termine viviendo el type

/**
 * Traduce CharacterInput (WASD/Shift/Space, ya escuchado por un solo listener global)
 * a la forma que espera BoardController (BoardInputState), sin duplicar listeners de teclado.
 * Mapeo (placeholder, a confirmar con el feel real una vez portado el controller):
 *   forward   (Shift en POC2) <- CharacterInput.cruise (Shift)
 *   pitchDown (W en POC2)     <- CharacterInput.forward (W)
 *   turnLeft  (A)             <- CharacterInput.left (A)
 *   turnRight (D)             <- CharacterInput.right (D)
 *   jump      (Space)         <- CharacterInput.consumeJumpRequest() (mismo flag que StandAlone/salto)
 *   testImpulse (T)           <- no mapeado todavía, siempre false (feature de debug de POC2)
 */
export class HoverBoardInputAdapter {
  constructor(private characterInput: CharacterInput) {}

  get current(): BoardInputState {
    const { cruise, forward, left, right } = this.characterInput.current;
    return {
      forward: cruise,
      pitchDown: forward,
      turnLeft: left,
      turnRight: right,
    };
  }

  consumeJumpRequest(): boolean {
    return this.characterInput.consumeJumpRequest();
  }

  consumeTestImpulseRequest(): boolean {
    return false; // placeholder — sin key mapeada todavía en CharacterInput
  }
}