import type { GameState } from "../fsm/game-state";

/** Estado 1 — Presentación. Placeholder: la UI y el "press any key" vienen en la próxima iteración. */
export class SplashState implements GameState {
  readonly id = "splash" as const;

  enter(): void {
    // TODO: mostrar UI de presentación
  }

  exit(): void {
    // TODO: limpiar UI de presentación
  }
}
