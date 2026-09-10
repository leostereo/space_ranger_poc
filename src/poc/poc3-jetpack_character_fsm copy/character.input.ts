export interface CharacterInputState {
  forward: boolean;  // W
  backward: boolean; // S
  left: boolean;     // A
  right: boolean;    // D
  up: boolean;       // Space (empuje del jetpack mientras está equipado)
  cruise: boolean;   // Shift — mantenido en Jetpack/On dispara Cruising, al soltar vuelve a On
  shoot: boolean;     // "/" — mantenido en Jetpack/On dispara Shooting, Shift tiene prioridad
}

export class CharacterInput {
  private state: CharacterInputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    cruise: false,
    shoot: false,
  };

  /**
   * Único flag para Ctrl: no distingue jetpack/board, eso lo decide
   * CharacterFsm.requestEquipment() según el sub-estado activo.
   */
  private equipRequested = false;
  private jumpRequested = false;

  constructor() {
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
  }

  get current(): CharacterInputState {
    return this.state;
  }

  consumeEquipRequest(): boolean {
    if (!this.equipRequested) return false;
    this.equipRequested = false;
    return true;
  }

  consumeJumpRequest(): boolean {
    if (!this.jumpRequested) return false;
    this.jumpRequested = false;
    return true;
  }

  dispose(): void {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
  }

  private _onKeyDown = (ev: KeyboardEvent): void => {
    switch (ev.code) {
      case "KeyW": this.state.forward = true; break;
      case "KeyS": this.state.backward = true; break;
      case "KeyA": this.state.left = true; break;
      case "KeyD": this.state.right = true; break;
      case "Space": this.state.up = true; this.jumpRequested = true; break;
      case "ShiftLeft":
      case "ShiftRight":
        this.state.cruise = true;
        break;
      case "Slash": // NUEVO — tecla "/"
        this.state.shoot = true;
        break;
      case "ControlLeft":
      case "ControlRight":
        this.equipRequested = true;
        break;
    }
  };

  private _onKeyUp = (ev: KeyboardEvent): void => {
    switch (ev.code) {
      case "KeyW": this.state.forward = false; break;
      case "KeyS": this.state.backward = false; break;
      case "KeyA": this.state.left = false; break;
      case "KeyD": this.state.right = false; break;
      case "Space": this.state.up = false; break;
      case "ShiftLeft":
      case "ShiftRight":
        this.state.cruise = false;
        break;
      case "Slash": // NUEVO
        this.state.shoot = false;
        break;
    }
  };
}
