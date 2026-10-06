import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Scene } from "@babylonjs/core/scene";

import type { GameContext } from "./game-context";
import { GameFsm } from "./fsm/game-fsm";
import { SplashState } from "./states/splash-state";

/** Raíz de composición del juego: arma el contexto, la GameFsm y sus estados. */
export class Game {
  private readonly fsm: GameFsm;
  private readonly debugHudReady: Promise<void>;
  private detachDebugHud?: () => void;

  constructor(scene: Scene, engine: AbstractEngine, canvas: HTMLCanvasElement) {
    const context: GameContext = { scene, engine, canvas };

    this.fsm = new GameFsm(context, [
      new SplashState(),
      // próximas iteraciones: AssetsLoadingState, LevelSetupState, PlayingState, ...
    ]);

    // import.meta.env.DEV es `false` literal en el build: la rama (y el import dinámico) se eliminan.
    this.debugHudReady = import.meta.env.DEV ? this.attachDebugHud() : Promise.resolve();
  }

  async start(): Promise<void> {
    await this.debugHudReady; // evita perder los primeros eventos de la FSM
    await this.fsm.transitionTo("splash");
  }

  update(deltaTime: number): void {
    this.fsm.update(deltaTime);
  }

  dispose(): void {
    this.detachDebugHud?.();
    this.fsm.dispose();
  }

  private async attachDebugHud(): Promise<void> {
    const { attachGameDebugHud } = await import("../debug/attach-game-debug-hud");
    this.detachDebugHud = attachGameDebugHud(this.fsm.events);
  }
}
