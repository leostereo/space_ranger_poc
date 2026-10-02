import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { EventManager, GameEvents } from "./event-manager";

const DEBUG_KEY = "KeyH";
const DEBUG_DAMAGE = 10;

export class PlayerShotDebugEmitter {
  private readonly _onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.code !== DEBUG_KEY || ev.repeat) return;

    EventManager.emit(GameEvents.PlayerShooted, {
      damage: DEBUG_DAMAGE,
      hitPoint: Vector3.Zero(),
      direction: Vector3.Forward().negate(),
      sourceId: "debug",
    });
  };

  constructor() {
    window.addEventListener("keydown", this._onKeyDown);
  }

  dispose(): void {
    window.removeEventListener("keydown", this._onKeyDown);
  }
}