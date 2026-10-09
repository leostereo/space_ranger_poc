import type { GameContext } from "../game-context";

export type GameStateId =
  | "splash"
  | "assets-loading"
  | "level-setup" // 3A + 3B como pasos internos del mismo estado
  | "playing"
  | "paused"
  | "game-over"
  | "level-cleared"
  | "game-finished";

export interface GameState {
  readonly id: GameStateId;

  /** Puede ser async (carga de assets). `previousId` es null en la primera transición. */
  enter(context: GameContext, previousId: GameStateId | null): void | Promise<void>;

  /** Se llama cada frame solo cuando enter() ya terminó. */
  update?(deltaTime: number): void;

  /**
   * Debe ser seguro e idempotente aunque enter() no haya terminado:
   * la FSM lo llama si otra transición llega mientras el estado todavía carga.
   */
  exit(): void;
}

/** Lo único que un estado necesita de la FSM: pedir una transición. */
export interface GameStateTransitioner {
  transitionTo(id: GameStateId): Promise<void>;
}
