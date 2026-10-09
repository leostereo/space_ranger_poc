import type { HotkeyService } from "../core/input/hotkey-service";
import type { GameState, GameStateTransitioner } from "../fsm/game-state";
import type { LevelSession } from "../levels/level-session";
import { PauseScreen } from "../screens/pause-screen";
import type { ScreenManager } from "../ui/screens/screen-manager";

const RESUME_HOTKEYS = ["Escape", "KeyP"] as const;

/** Estado 5 — Pausa: congela la partida y muestra el objetivo del nivel. */
export class PausedState implements GameState {
  readonly id = "paused" as const;

  private readonly screen = new PauseScreen();
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly screens: ScreenManager,
    private readonly hotkeys: HotkeyService,
    private readonly session: LevelSession,
    private readonly transitioner: GameStateTransitioner,
  ) {}

  enter(): void {
    const active = this.session.current;
    active?.strategy?.pause();
    this.screen.setBrief(active?.definition.brief ?? "");
    this.screens.show(this.screen);

    for (const code of RESUME_HOTKEYS) {
      this.cleanups.push(
        this.hotkeys.onHotkey(code, () => {
          this.transitioner.transitionTo("playing").catch(console.error);
        }),
      );
    }
  }

  exit(): void {
    this.cleanups.forEach((cleanup) => cleanup());
    this.cleanups.length = 0;
    this.screens.hide(this.screen);
  }
}
