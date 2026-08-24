// src/poc3-jetpack_character_fsm/character.input.ts

/**
 * Input crudo, único, compartido entre strategies — mismo criterio de minimalismo que
 * BoardInput en poc2 ("no usa el CommandDispatcher del juego todavía"). Lo que SÍ es nuevo
 * respecto a poc2: la traducción "tecla -> acción" no vive acá ni en el physics
 * controller, vive en el IInputController de la strategy activa (ver contracts/iinput-controller.ts).
 */
export interface CharacterInputState {
  forward: boolean;  // W
  backward: boolean; // S
  left: boolean;     // A
  right: boolean;    // D
  up: boolean;       // Space (empuje del jetpack mientras está equipado)
}

export class CharacterInput {
  private state: CharacterInputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
  };

  private equipJetpackRequested = false;
  private jumpRequested = false;

  constructor() {
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
  }

  get current(): CharacterInputState {
    return this.state;
  }

  /** Equipar jetpack (Ctrl). Edge-triggered, mismo criterio que consumeJumpRequest() en poc2. */
  consumeEquipJetpackRequest(): boolean {
    if (!this.equipJetpackRequested) return false;
    this.equipJetpackRequested = false;
    return true;
  }

  /**
   * Salto (Space). Edge-triggered — misma tecla física que `up` (empuje del jetpack),
   * pero consumida una sola vez por tecla presionada, no continua. Sólo tiene efecto
   * mientras StandAlone esté activo (StandAloneFsm.requestJump() ignora la llamada si no
   * está en OnGround); en Jetpack, el input controller de esa strategy no la consume, así
   * que no interfiere con la lectura continua de `up`.
   */
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
      case "ControlLeft":
      case "ControlRight":
        this.equipJetpackRequested = true;
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
    }
  };
}