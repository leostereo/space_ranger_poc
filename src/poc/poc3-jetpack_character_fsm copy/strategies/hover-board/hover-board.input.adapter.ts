// src/poc4-.../strategies/hover-board/hover-board.input.adapter.ts
import type { CharacterInput } from "../../character.input";

/** Mismo shape que BoardInputState de POC2 — se redefine acá para no importar
 * board.input.ts entero (esa clase trae sus propios window listeners, que no queremos duplicar). */
export interface BoardInputState {
  forward: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  pitchDown: boolean;
}

/**
 * Traduce CharacterInput (un solo listener global de teclado) a la forma que espera
 * HoverBoardPhysicsController. Mapeo confirmado (no tocar): Shift=forward del board,
 * W=pitchDown, A/D=turn. Ya funciona bien así.
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
}