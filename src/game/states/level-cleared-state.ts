import type { AnyInputService } from "../core/input/any-input-service";
import type { GameState, GameStateTransitioner } from "../fsm/game-state";
import type { LevelRepository } from "../levels/level-repository";
import type { LevelSession } from "../levels/level-session";
import { LevelClearedScreen } from "../screens/level-cleared-screen";
import type { ScreenManager } from "../ui/screens/screen-manager";

/** Estado 7 — Victoria: marca el nivel como completado, libera la partida y pasa al siguiente con press any key. */
export class LevelClearedState implements GameState {
  readonly id = "level-cleared" as const;

  private readonly screen = new LevelClearedScreen();
  private cancelInputWait: (() => void) | null = null;

  constructor(
    private readonly screens: ScreenManager,
    private readonly input: AnyInputService,
    private readonly session: LevelSession,
    private readonly levels: LevelRepository,
    private readonly transitioner: GameStateTransitioner,
  ) {}

  enter(): void {
    const active = this.session.current;
    if (active) {
      this.levels.markCompleted(active.definition.id);
    }
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
