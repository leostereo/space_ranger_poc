import type { GameStateId } from "./game-state";

/** Eventos de ciclo de vida de la GameFsm (hoy se usan para debug). */
export interface GameFsmEventMap {
  transitionStarted: { from: GameStateId | null; to: GameStateId; at: number };
  stateExited: { id: GameStateId; at: number };
  stateEntered: { id: GameStateId; enterDurationMs: number; at: number };
  transitionCancelled: { to: GameStateId; reason: "superseded"; at: number };
  transitionFailed: { to: GameStateId; error: unknown; at: number };
}
