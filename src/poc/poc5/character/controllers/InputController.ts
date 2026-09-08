import { Scene, KeyboardEventTypes } from "@babylonjs/core";

export class InputController {
  public adelante: boolean = false;
  public atras: boolean = false;       // <-- Nuevo
  public izquierda: boolean = false;   // <-- Nuevo
  public derecha: boolean = false;     // <-- Nuevo
  public ctrl: boolean = false;
  public salto: boolean = false;

  constructor(scene: Scene) {
    scene.onKeyboardObservable.add((kbInfo) => {
      const pressed = kbInfo.type === KeyboardEventTypes.KEYDOWN;
      
      switch (kbInfo.event.key.toLowerCase()) {
        case "w":
        case "arrowup":
          this.adelante = pressed;
          break;
        case "s":
        case "arrowdown":
          this.atras = pressed; // <-- Asignamos atrás
          break;
        case "a":
        case "arrowleft":
          this.izquierda = pressed; // <-- Asignamos izquierda
          break;
        case "d":
        case "arrowright":
          this.derecha = pressed; // <-- Asignamos derecha
          break;
        case "control":
          this.ctrl = pressed;
          break;
        case " ":
          this.salto = pressed;
          break;
      }
    });
  }
}
