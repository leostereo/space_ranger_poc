import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Scene } from "@babylonjs/core/scene";

import { AssetLoader } from "./assets/asset-loader";
import { AssetRegistry } from "./assets/asset-registry";
import { AnyInputService } from "./core/input/any-input-service";
import { HotkeyService } from "./core/input/hotkey-service";
import { createSafeStorage } from "./core/storage/safe-storage";
import { GameFsm } from "./fsm/game-fsm";
import type { GameContext } from "./game-context";
import { LEVEL_DEFINITIONS } from "./levels/level-definitions";
import { LevelLoader } from "./levels/level-loader";
import { LevelRepository } from "./levels/level-repository";
import { LevelSession } from "./levels/level-session";
import { AssetsLoadingState } from "./states/assets-loading-state";
import { GameFinishedState } from "./states/game-finished-state";
import { GameOverState } from "./states/game-over-state";
import { LevelClearedState } from "./states/level-cleared-state";
import { LevelSetupState } from "./states/level-setup-state";
import { PausedState } from "./states/paused-state";
import { PlayingState } from "./states/playing-state";
import { SplashState } from "./states/splash-state";
import { ScreenManager } from "./ui/screens/screen-manager";

/** Raíz de composición del juego: arma el contexto, los servicios, la GameFsm y sus estados. */
export class Game {
  private readonly screens: ScreenManager;
  private readonly input: AnyInputService;
  private readonly hotkeys: HotkeyService;
  private readonly assets: AssetRegistry;
  private readonly assetLoader: AssetLoader;
  private readonly levels: LevelRepository;
  private readonly levelSession: LevelSession;
  private readonly levelLoader: LevelLoader;
  private readonly fsm: GameFsm;
  private readonly debugToolsReady: Promise<void>;
  private detachDebugTools?: () => void;

  constructor(scene: Scene, engine: AbstractEngine, canvas: HTMLCanvasElement) {
    this.assets = new AssetRegistry();
    const context: GameContext = { scene, engine, canvas, assets: this.assets };

    this.screens = new ScreenManager();
    this.input = new AnyInputService();
    this.hotkeys = new HotkeyService();
    this.assetLoader = new AssetLoader(scene, this.assets);
    this.levels = new LevelRepository(LEVEL_DEFINITIONS, createSafeStorage());
    this.levelSession = new LevelSession(scene);
    this.levelLoader = new LevelLoader(scene);
    this.fsm = new GameFsm(context);
    this.fsm.register(
      new SplashState(this.screens, this.input, this.fsm),
      new AssetsLoadingState(this.screens, this.input, this.assetLoader, this.assets, this.fsm),
      new LevelSetupState(this.screens, this.levels, this.levelLoader, this.levelSession, this.fsm),
      new PlayingState(this.hotkeys, this.levelSession, this.fsm),
      new PausedState(this.screens, this.hotkeys, this.levelSession, this.fsm),
      new GameOverState(this.screens, this.input, this.levelSession, this.fsm),
      new LevelClearedState(this.screens, this.input, this.levelSession, this.levels, this.fsm),
      new GameFinishedState(this.screens, this.input, this.levels, this.fsm),
    );

    // import.meta.env.DEV es `false` literal en el build: la rama (y los imports dinámicos) se eliminan.
    this.debugToolsReady = import.meta.env.DEV ? this.attachDebugTools() : Promise.resolve();
  }

  async start(): Promise<void> {
    await this.debugToolsReady; // evita perder los primeros eventos de la FSM
    await this.fsm.transitionTo("splash");
  }

  update(deltaTime: number): void {
    this.fsm.update(deltaTime);
  }

  dispose(): void {
    this.detachDebugTools?.();
    this.fsm.dispose();
    this.levelSession.end();
    this.levelLoader.dispose();
    this.assetLoader.dispose();
    this.assets.dispose();
    this.hotkeys.dispose();
    this.input.dispose();
    this.screens.dispose();
  }

  private async attachDebugTools(): Promise<void> {
    const [{ attachGameDebugHud }, { attachLevelDebugKeys }] = await Promise.all([
      import("./debug/attach-game-debug-hud"),
      import("./debug/attach-level-debug-keys"),
    ]);
    const detachHud = attachGameDebugHud(this.fsm.events, this.levelSession);
    const detachKeys = attachLevelDebugKeys(this.hotkeys, this.levelSession);
    this.detachDebugTools = () => {
      detachHud();
      detachKeys();
    };
  }
}
