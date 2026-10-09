import type { AnyInputService } from "../core/input/any-input-service";
import type { GameState, GameStateTransitioner } from "../fsm/game-state";
import type { LevelSession } from "../levels/level-session";
import { GameOverScreen } from "../screens/game-over-screen";
import type { ScreenManager } from "../ui/screens/screen-manager";

/** Estado 6 — Derrota: libera la partida y, con press any key, reconstruye el nivel (sigue pendiente). */
export class GameOverState implements GameState {
  readonly id = "game-over" as const;

  private readonly screen = new GameOverScreen();
  private cancelInputWait: (() => void) | null = null;

  constructor(
    private readonly screens: ScreenManager,
    private readonly input: AnyInputService,
    private readonly session: LevelSession,
    private readonly transitioner: GameStateTransitioner,
  ) {}

  enter(): void {
    this.session.disposeStrategy();
    this.screens.show(this.screen);
    this.cancelInputWait = this.input.onNextInput(() => {
      this.transitioner.transitionTo("level-setup").catch(console.error);
    });
  }

  exit(): void {
    this.cancelInputWait?.();
    this.cancelInputWait = null;
    this.screens.hide(this.screen);
  }
}
