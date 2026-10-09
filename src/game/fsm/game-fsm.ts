import { TypedEventEmitter } from "../core/events/typed-event-emitter";
import type { GameFsmEventMap } from "./game-fsm-events";
import type { GameContext } from "../game-context";
import type { GameState, GameStateId, GameStateTransitioner } from "./game-state";

type Phase = "idle" | "entering" | "active";

export class GameFsm implements GameStateTransitioner {
  readonly events = new TypedEventEmitter<GameFsmEventMap>();

  private readonly states = new Map<GameStateId, GameState>();
  private current: GameState | null = null;
  private phase: Phase = "idle";
  private transitionToken = 0; // invalida enter() async superados por otra transición

  constructor(private readonly context: GameContext) {}

  get currentId(): GameStateId | null {
    return this.current?.id ?? null;
  }

  /** Registra estados. Se hace después de construir la FSM para que los estados puedan recibirla como transitioner. */
  register(...states: readonly GameState[]): void {
    for (const state of states) {
      if (this.states.has(state.id)) {
        throw new Error(`[GameFsm] duplicated state "${state.id}"`);
      }
      this.states.set(state.id, state);
    }
  }

  async transitionTo(nextId: GameStateId): Promise<void> {
    const next = this.states.get(nextId);
    if (!next) {
      throw new Error(`[GameFsm] state "${nextId}" is not registered`);
    }

    const token = ++this.transitionToken;
    const previousId = this.currentId;
    this.events.emit("transitionStarted", { from: previousId, to: nextId, at: performance.now() });

    if (this.current) {
      const exitingId = this.current.id;
      this.current.exit();
      this.events.emit("stateExited", { id: exitingId, at: performance.now() });
    }

    this.current = next;
    this.phase = "entering";

    const startedAt = performance.now();
    try {
      await next.enter(this.context, previousId);
    } catch (error) {
      this.events.emit("transitionFailed", { to: nextId, error, at: performance.now() });
      throw error;
    }

    if (token !== this.transitionToken) {
      // Otra transición ya llamó a next.exit(); no activar este estado.
      this.events.emit("transitionCancelled", { to: nextId, reason: "superseded", at: performance.now() });
      return;
    }

    this.phase = "active";
    const now = performance.now();
    this.events.emit("stateEntered", { id: nextId, enterDurationMs: now - startedAt, at: now });
  }

  update(deltaTime: number): void {
    if (this.phase === "active") {
      this.current?.update?.(deltaTime);
    }
  }

  dispose(): void {
    this.transitionToken++;
    this.current?.exit();
    this.current = null;
    this.phase = "idle";
    this.events.clear();
  }
}
