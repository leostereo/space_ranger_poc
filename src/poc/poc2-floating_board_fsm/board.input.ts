// src/poc2-floating_board_fsm/board.input.ts

/**
 * Input crudo para el POC. No usa el CommandDispatcher del juego todavía
 * (eso se resuelve cuando este POC se integre al proyecto real) — acá el
 * objetivo es simple: validar el feel del movimiento cuanto antes.
 */
export interface BoardInputState {
  forward: boolean; // Shift
  turnLeft: boolean; // A
  turnRight: boolean; // D
  pitchDown: boolean; // W
}

export class BoardInput {
  private state: BoardInputState = { forward: false, turnLeft: false, turnRight: false, pitchDown: false };

  private jumpRequested = false;
  private testImpulseRequested = false;

  constructor() {
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
  }

  get current(): BoardInputState {
    return this.state;
  }

  /** Salto (Space). Edge-triggered: una sola vez por tecla presionada, no se repite mientras se mantiene. */
  consumeJumpRequest(): boolean {
    if (!this.jumpRequested) return false;
    this.jumpRequested = false;
    return true;
  }

  /** Impulso de test (T), simula el peso del personaje aterrizando sobre el board. */
  consumeTestImpulseRequest(): boolean {
    if (!this.testImpulseRequested) return false;
    this.testImpulseRequested = false;
    return true;
  }

  dispose(): void {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
  }

  private _onKeyDown = (ev: KeyboardEvent): void => {
    switch (ev.code) {
      case "ShiftLeft":
      case "ShiftRight":
        this.state.forward = true;
        break;
      case "KeyA":
        this.state.turnLeft = true;
        break;
      case "KeyD":
        this.state.turnRight = true;
        break;
      case "Space":
        this.jumpRequested = true;
        break;
      case "KeyW":
        this.state.pitchDown = true;
        break;
      case "KeyT":
        this.testImpulseRequested = true;
        break;
    }
  };

  private _onKeyUp = (ev: KeyboardEvent): void => {
    switch (ev.code) {
      case "ShiftLeft":
      case "ShiftRight":
        this.state.forward = false;
        break;
      case "KeyA":
        this.state.turnLeft = false;
        break;
      case "KeyD":
        this.state.turnRight = false;
        break;
      case "KeyW":
        this.state.pitchDown = false;
        break;
    }
  };
}