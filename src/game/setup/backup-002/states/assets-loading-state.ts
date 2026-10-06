import type { ScreenManager } from "../../ui/screens/screen-manager";
import type { GameState } from "../fsm/game-state";
import { LoadingScreen } from "../screens/loading-screen";

/** Estado 2 — Carga de assets comunes. Placeholder: solo muestra la pantalla de carga. */
export class AssetsLoadingState implements GameState {
  readonly id = "assets-loading" as const;

  private readonly screen = new LoadingScreen();

  constructor(private readonly screens: ScreenManager) {}

  enter(): void {
    this.screens.show(this.screen);
    // TODO 2a: AssetsManager + progreso real
    // TODO 2b: overlay de controles + press any key -> "level-setup"
  }

  exit(): void {
    this.screens.hide(this.screen);
  }
}
