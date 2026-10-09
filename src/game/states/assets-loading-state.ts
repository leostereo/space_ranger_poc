import type { AssetLoader } from "../assets/asset-loader";
import type { AssetRegistry } from "../assets/asset-registry";
import type { AnyInputService } from "../core/input/any-input-service";
import type { GameState, GameStateTransitioner } from "../fsm/game-state";
import { ControlsScreen } from "../screens/controls-screen";
import { LoadingScreen } from "../screens/loading-screen";
import type { ScreenManager } from "../ui/screens/screen-manager";

/**
 * Estado 2 — Carga de assets comunes.
 *  2a: carga con barra de progreso real (enter() espera a que termine, por eso el
 *      evento stateEntered de la FSM refleja el tiempo de carga).
 *  2b: overlay de controles; con press any key pasa a "level-setup".
 */
export class AssetsLoadingState implements GameState {
  readonly id = "assets-loading" as const;

  private readonly loadingScreen = new LoadingScreen();
  private controlsScreen: ControlsScreen | null = null; // se crea tras la carga: usa la imagen ya descargada
  private cancelInputWait: (() => void) | null = null;
  private unsubscribeProgress: (() => void) | null = null;
  private exited = false;

  constructor(
    private readonly screens: ScreenManager,
    private readonly input: AnyInputService,
    private readonly loader: AssetLoader,
    private readonly assets: AssetRegistry,
    private readonly transitioner: GameStateTransitioner,
  ) {}

  async enter(): Promise<void> {
    this.exited = false;
    this.screens.show(this.loadingScreen);
    this.loadingScreen.setProgress(0);
    this.loadingScreen.setStatus("");
    this.unsubscribeProgress = this.loader.events.on("progressChanged", ({ fraction }) => {
      this.loadingScreen.setProgress(fraction);
    });

    try {
      await this.loader.loadCommonAssets();
    } catch (error) {
      if (!this.exited) {
        this.loadingScreen.setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
      throw error;
    } finally {
      this.unsubscribeProgress?.();
      this.unsubscribeProgress = null;
    }

    if (this.exited) {
      return; // otra transición lo superó mientras cargaba
    }

    this.controlsScreen ??= new ControlsScreen(this.assets.getImage("keymap"));
    this.screens.show(this.controlsScreen);
    this.cancelInputWait = this.input.onNextInput(() => {
      this.transitioner.transitionTo("level-setup").catch(console.error);
    });
  }

  exit(): void {
    this.exited = true;
    this.unsubscribeProgress?.();
    this.unsubscribeProgress = null;
    this.cancelInputWait?.();
    this.cancelInputWait = null;
    this.screens.hide(this.loadingScreen);
    if (this.controlsScreen) {
      this.screens.hide(this.controlsScreen);
    }
  }
}
