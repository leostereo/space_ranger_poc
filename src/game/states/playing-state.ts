import type { GameStateId } from "../fsm/game-state";
import type { GameState, GameStateTransitioner } from "../fsm/game-state";
import type { GameContext } from "../game-context";
import type { HotkeyService } from "../core/input/hotkey-service";
import type { LevelSession } from "../levels/level-session";

const PAUSE_HOTKEYS = ["Escape", "KeyP"] as const;

/**
 * Estado 4 — Jugando. Delega cada frame en strategy.tick(dt).
 * Desde 3B arranca la partida (play); al volver de la pausa la retoma (resume).
 * No libera nada al salir: pausar no destruye, y la partida la libera quien la termina (estados 6 y 7).
 */
export class PlayingState implements GameState {
  readonly id = "playing" as const;

  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly hotkeys: HotkeyService,
    private readonly session: LevelSession,
    private readonly transitioner: GameStateTransitioner,
  ) {}

  enter(_context: GameContext, previousId: GameStateId | null): void {
    const strategy = this.session.current?.strategy;
    if (!strategy) {
      throw new Error("[PlayingState] there is no strategy: did level-setup (3B) finish?");
    }

    this.cleanups.push(
      strategy.events.on("levelFinished", ({ outcome }) => {
        this.transitioner.transitionTo(outcome === "completed" ? "level-cleared" : "game-over").catch(console.error);
      }),
    );
    for (const code of PAUSE_HOTKEYS) {
      this.cleanups.push(
        this.hotkeys.onHotkey(code, () => {
          this.transitioner.transitionTo("paused").catch(console.error);
        }),
      );
    }

    if (previousId === "paused") {
      strategy.resume();
    } else {
      strategy.play();
    }
  }

  update(deltaTime: number): void {
    this.session.current?.strategy?.tick(deltaTime);
  }

  exit(): void {
    this.cleanups.forEach((cleanup) => cleanup());
    this.cleanups.length = 0;
  }
}
