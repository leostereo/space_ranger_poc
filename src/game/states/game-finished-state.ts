import type { AnyInputService } from "../core/input/any-input-service";
import type { GameState, GameStateTransitioner } from "../fsm/game-state";
import type { LevelRepository } from "../levels/level-repository";
import { GameFinishedScreen } from "../screens/game-finished-screen";
import type { ScreenManager } from "../ui/screens/screen-manager";

/** Estado 8 — Juego completado: con press any key borra el progreso y vuelve al estado 1. */
export class GameFinishedState implements GameState {
  readonly id = "game-finished" as const;

  private readonly screen = new GameFinishedScreen();
  private cancelInputWait: (() => void) | null = null;

  constructor(
    private readonly screens: ScreenManager,
    private readonly input: AnyInputService,
    private readonly levels: LevelRepository,
    private readonly transitioner: GameStateTransitioner,
  ) {}

  enter(): void {
    this.screens.show(this.screen);
    this.cancelInputWait = this.input.onNextInput(() => {
      this.levels.reset();
      this.transitioner.transitionTo("splash").catch(console.error);
    });
  }

  exit(): void {
    this.cancelInputWait?.();
    this.cancelInputWait = null;
    this.screens.hide(this.screen);
  }
}
