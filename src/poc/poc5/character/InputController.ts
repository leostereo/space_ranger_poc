import { Scene, KeyboardEventTypes } from "@babylonjs/core";

export class InputController {
  public adelante: boolean = false;
  public ctrl: boolean = false;

  constructor(scene: Scene) {
    scene.onKeyboardObservable.add((kbInfo) => {
      const pressed = kbInfo.type === KeyboardEventTypes.KEYDOWN;
      
      switch (kbInfo.event.key.toLowerCase()) {
        case "w":
        case "arrowup":
          this.adelante = pressed;
          break;
        case "control":
          this.ctrl = pressed;
          break;
      }
    });
  }
}