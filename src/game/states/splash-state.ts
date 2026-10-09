import type { AnyInputService } from "../core/input/any-input-service";
import type { ScreenManager } from "../ui/screens/screen-manager";
import type { GameState, GameStateTransitioner } from "../fsm/game-state";
import { SplashScreen } from "../screens/splash-screen";

/** Estado 1 — Presentación: muestra el splash y avanza con press any key. */
export class SplashState implements GameState {
  readonly id = "splash" as const;

  private readonly screen = new SplashScreen();
  private cancelInputWait: (() => void) | null = null;

  constructor(
    private readonly screens: ScreenManager,
    private readonly input: AnyInputService,
    private readonly transitioner: GameStateTransitioner,
  ) {}

  enter(): void {
    this.screens.show(this.screen);
    this.cancelInputWait = this.input.onNextInput(() => {
      this.transitioner.transitionTo("assets-loading").catch(console.error);
    });
  }

  exit(): void {
    this.cancelInputWait?.();
    this.cancelInputWait = null;
    this.screens.hide(this.screen);
  }
}
