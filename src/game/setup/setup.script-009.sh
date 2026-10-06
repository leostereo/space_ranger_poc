#!/usr/bin/env bash
# setup.script-009 — Estados 3B, 4, 5, 6 y 7: la FSM completa, con un strategy placeholder.
# Ejecutar parado en /src:   bash game/setup/setup.script-009.sh
#
# Qué hace:
#   levels/level-strategy.ts     LevelStrategy: clase base (template method) con play/pause/resume/tick/dispose.
#                                Pausa = congela física y animaciones. Avisa con el evento levelFinished.
#   levels/strategies/...        Level01Strategy (placeholder: sin Character/enemigos/HUD todavía)
#   levels/level-factory.ts      createLevelStrategy (3B): un strategy concreto por nivel
#   states/                      PlayingState (4), PausedState (5), GameOverState (6), LevelClearedState (7)
#   screens/                     pausa (con el brief del nivel), game over y nivel completado
#   core/input/hotkey-service    atajos globales por KeyboardEvent.code (Esc/P = pausa)
#   debug/attach-level-debug-keys  SOLO DEV: 1 = completar el nivel, 2 = fallar
#   Actualiza 4 archivos SOLO si no los editaste (si no, deja <archivo>.new):
#     levels/level-session.ts    ahora guarda el strategy (setStrategy / disposeStrategy)
#     states/level-setup-state   suma 3B y pasa solo a "playing"
#     game.ts                    registra los 8 estados y conecta HotkeyService
#     ui/screens/screens.css     estilo del brief en la pausa
set -euo pipefail

if [[ "$(basename "$PWD")" != "src" ]]; then
  echo "Error: ejecutá este script parado en la carpeta src (actual: $PWD)" >&2
  exit 1
fi

BOOT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ ! -f "$BOOT_DIR/_lib.sh" ]]; then
  echo "Error: falta $BOOT_DIR/_lib.sh (lo crea setup.script-001.sh)" >&2
  exit 1
fi
# shellcheck source=_lib.sh
source "$BOOT_DIR/_lib.sh"

setup_begin "$0"
setup_requires "setup.script-008.sh"

echo "-- archivos nuevos"

write_file "game/core/input/hotkey-service.ts" <<'EOF'
type HotkeyListener = () => void;

/**
 * Atajos de teclado globales de la interfaz (pausa, depuración). Se identifican por
 * `KeyboardEvent.code` ("Escape", "KeyP"): no dependen del idioma del teclado.
 *
 * No es el input del personaje (eso va en los input controllers) ni "press any key"
 * (AnyInputService). Ignora teclas mantenidas y combinaciones con Ctrl/Alt/Meta.
 */
export class HotkeyService {
  private readonly bindings = new Map<string, Set<HotkeyListener>>();

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    const listeners = this.bindings.get(event.code);
    if (!listeners || listeners.size === 0) {
      return;
    }
    // Snapshot: lo que se suscriba durante la notificación (el estado siguiente) espera una pulsación NUEVA.
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        console.error(`[HotkeyService] listener failed for "${event.code}"`, error);
      }
    }
  };

  constructor(private readonly target: Window = window) {
    this.target.addEventListener("keydown", this.handleKeyDown);
  }

  /** Devuelve la función para desuscribir. */
  onHotkey(code: string, listener: HotkeyListener): () => void {
    const listeners = this.bindings.get(code) ?? new Set<HotkeyListener>();
    listeners.add(listener);
    this.bindings.set(code, listeners);
    return () => {
      listeners.delete(listener);
    };
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.handleKeyDown);
    this.bindings.clear();
  }
}
EOF

write_file "game/levels/level-strategy.ts" <<'EOF'
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";

import { TypedEventEmitter } from "../core/events/typed-event-emitter";
import type { GameContext } from "../game-context";
import type { LevelDefinition } from "./level-definition";
import type { LevelScope } from "./level-scope";

export type LevelOutcome = "completed" | "failed";

export interface LevelStrategyEventMap {
  levelFinished: { outcome: LevelOutcome };
}

export interface LevelStrategyDeps {
  readonly context: GameContext;
  readonly definition: LevelDefinition;
  readonly scope: LevelScope;
}

type Phase = "created" | "playing" | "paused" | "finished" | "disposed";

/**
 * Director del gameplay de un nivel durante el estado 4 (template method).
 * Cada nivel hereda y define sus reglas (onTick / checkWin / checkLose).
 *
 * No conoce la FSM: avisa con el evento `levelFinished` y el estado `playing` decide la transición.
 * Los recursos de nivel los libera el LevelScope; acá se libera lo propio de la partida.
 */
export abstract class LevelStrategy {
  readonly events = new TypedEventEmitter<LevelStrategyEventMap>();

  protected readonly context: GameContext;
  protected readonly definition: LevelDefinition;
  protected readonly scope: LevelScope;

  private phase: Phase = "created";
  private pausedAnimationGroups: AnimationGroup[] = [];
  private physicsWasEnabled = true;

  constructor(deps: LevelStrategyDeps) {
    this.context = deps.context;
    this.definition = deps.definition;
    this.scope = deps.scope;
  }

  /** Arranque (desde 3B). */
  play(): void {
    if (this.phase !== "created") {
      throw new Error(`[LevelStrategy] play() called in phase "${this.phase}"`);
    }
    this.phase = "playing";
    this.onPlay();
  }

  /** Congela la partida: física y animaciones. El render de Babylon sigue activo. */
  pause(): void {
    if (this.phase !== "playing") {
      return;
    }
    this.phase = "paused";
    const { scene } = this.context;
    this.physicsWasEnabled = scene.physicsEnabled;
    scene.physicsEnabled = false;
    this.pausedAnimationGroups = scene.animationGroups.filter((group) => group.isPlaying);
    this.pausedAnimationGroups.forEach((group) => group.pause());
    this.onPause();
  }

  resume(): void {
    if (this.phase !== "paused") {
      return;
    }
    this.phase = "playing";
    this.context.scene.physicsEnabled = this.physicsWasEnabled;
    this.pausedAnimationGroups.forEach((group) => group.restart()); // retoma desde donde quedó
    this.pausedAnimationGroups = [];
    this.onResume();
  }

  /** Un frame de juego. Orden: entidades -> hook del nivel -> reglas de victoria/derrota. */
  tick(deltaTime: number): void {
    if (this.phase !== "playing") {
      return;
    }
    this.onTick(deltaTime);
    if (this.phase !== "playing") {
      return; // onTick pudo terminar el nivel
    }
    if (this.checkWin()) {
      this.finish("completed");
    } else if (this.checkLose()) {
      this.finish("failed");
    }
  }

  /** SOLO PARA DEPURACIÓN: fuerza el resultado del nivel. */
  forceOutcome(outcome: LevelOutcome): void {
    if (this.phase === "playing") {
      this.finish(outcome);
    }
  }

  /** Idempotente. */
  dispose(): void {
    if (this.phase === "disposed") {
      return;
    }
    this.phase = "disposed";
    this.onDispose();
    this.events.clear();
  }

  protected abstract onTick(deltaTime: number): void;
  protected abstract checkWin(): boolean;
  protected abstract checkLose(): boolean;

  protected onPlay(): void {}
  protected onPause(): void {}
  protected onResume(): void {}
  protected onDispose(): void {}

  /** Termina el nivel una sola vez y avisa. */
  protected finish(outcome: LevelOutcome): void {
    if (this.phase !== "playing") {
      return;
    }
    this.phase = "finished";
    this.events.emit("levelFinished", { outcome });
  }
}
EOF

write_file "game/levels/strategies/level-01-strategy.ts" <<'EOF'
import { LevelStrategy, type LevelStrategyDeps } from "../level-strategy";
import { createLevelViewer } from "../level-viewer-factory";

/**
 * Nivel 1. PLACEHOLDER: todavía no hay Character, enemigos ni HUD (migraciones siguientes),
 * así que no tiene reglas propias: el resultado se fuerza con las teclas de depuración (solo DEV).
 * El visor es la cámara placeholder; se reemplaza por la del personaje.
 */
export class Level01Strategy extends LevelStrategy {
  constructor(deps: LevelStrategyDeps) {
    super(deps);
    createLevelViewer(deps.context.scene, deps.context.canvas, deps.scope);
  }

  protected onTick(): void {
    // TODO: Character.update, EnemiesManager.update, HUD.update
  }

  protected checkWin(): boolean {
    return false; // TODO: todas las oleadas eliminadas
  }

  protected checkLose(): boolean {
    return false; // TODO: el personaje murió
  }
}
EOF

write_file "game/levels/level-factory.ts" <<'EOF'
import { Level01Strategy } from "./strategies/level-01-strategy";
import type { LevelStrategy, LevelStrategyDeps } from "./level-strategy";

type StrategyBuilder = (deps: LevelStrategyDeps) => LevelStrategy;

/** Un strategy concreto por nivel. Para agregar uno: crear la clase y registrarla acá. */
const STRATEGY_BUILDERS: Readonly<Record<string, StrategyBuilder>> = {
  "level-01": (deps) => new Level01Strategy(deps),
};

/** Estado 3B: arma el strategy del nivel (y, a futuro, Character, EnemiesManager y HUD que se le inyectan). */
export function createLevelStrategy(deps: LevelStrategyDeps): LevelStrategy {
  const build = STRATEGY_BUILDERS[deps.definition.id];
  if (!build) {
    throw new Error(`[createLevelStrategy] there is no strategy registered for the level "${deps.definition.id}"`);
  }
  return build(deps);
}
EOF

write_file "game/screens/pause-screen.ts" <<'EOF'
import { HtmlScreen } from "../ui/screens/html-screen";

/** Estado 5 — Pausa: muestra el brief (objetivo) de la misión actual. */
export class PauseScreen extends HtmlScreen {
  private readonly brief: HTMLElement;

  constructor() {
    super(
      "pause",
      "screen--pause",
      `
        <p class="screen__title">Paused</p>
        <p class="screen__brief"></p>
        <p class="screen__prompt">Press Esc to resume</p>
      `,
    );
    const brief = this.element.querySelector<HTMLElement>(".screen__brief");
    if (!brief) {
      throw new Error("[PauseScreen] the template is missing the brief element");
    }
    this.brief = brief;
  }

  setBrief(text: string): void {
    this.brief.textContent = text;
  }
}
EOF

write_file "game/screens/game-over-screen.ts" <<'EOF'
import { HtmlScreen } from "../ui/screens/html-screen";

/** Estado 6 — Derrota. Placeholder. */
export class GameOverScreen extends HtmlScreen {
  constructor() {
    super(
      "game-over",
      "screen--game-over",
      `
        <p class="screen__title">Game over</p>
        <p class="screen__prompt">Press any key to retry</p>
      `,
    );
  }
}
EOF

write_file "game/screens/level-cleared-screen.ts" <<'EOF'
import { HtmlScreen } from "../ui/screens/html-screen";

/** Estado 7 — Victoria. Placeholder. */
export class LevelClearedScreen extends HtmlScreen {
  constructor() {
    super(
      "level-cleared",
      "screen--level-cleared",
      `
        <p class="screen__title">Level cleared</p>
        <p class="screen__prompt">Press any key to continue</p>
      `,
    );
  }
}
EOF

write_file "game/states/playing-state.ts" <<'EOF'
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
EOF

write_file "game/states/paused-state.ts" <<'EOF'
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
EOF

write_file "game/states/game-over-state.ts" <<'EOF'
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
EOF

write_file "game/states/level-cleared-state.ts" <<'EOF'
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
EOF

write_file "game/debug/attach-level-debug-keys.ts" <<'EOF'
import type { HotkeyService } from "../core/input/hotkey-service";
import type { LevelSession } from "../levels/level-session";

/**
 * Teclas de depuración del nivel (solo DEV): 1 = completar, 2 = fallar.
 * Sirven para recorrer los estados 4 -> 6 / 7 mientras no hay gameplay real.
 * Devuelve la función para desconectarlas.
 */
export function attachLevelDebugKeys(hotkeys: HotkeyService, session: LevelSession): () => void {
  const unsubscribers = [
    hotkeys.onHotkey("Digit1", () => session.current?.strategy?.forceOutcome("completed")),
    hotkeys.onHotkey("Digit2", () => session.current?.strategy?.forceOutcome("failed")),
  ];
  console.info("[debug] keys: 1 = complete the level, 2 = fail the level, Esc/P = pause");
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}
EOF

echo "-- archivos actualizados (solo si no los editaste)"

update_file "game/levels/level-session.ts" "57e1a3b0ae60a7dbf3065b06d5204ac8dec7b5bf7fa2c6eded1b7531068a1158" <<'EOF'
import type { Scene } from "@babylonjs/core/scene";

import type { LevelDefinition } from "./level-definition";
import type { LoadedMap } from "./level-map-factory";
import { LevelScope } from "./level-scope";
import type { LevelStrategy } from "./level-strategy";

export interface ActiveLevel {
  readonly definition: LevelDefinition;
  readonly scope: LevelScope;
  /** null hasta que termina la carga (3A). */
  map: LoadedMap | null;
  /** null hasta 3B, y de nuevo null cuando la partida terminó (estados 6 y 7). */
  strategy: LevelStrategy | null;
}

/**
 * El nivel que está cargado ahora. Sobrevive a los estados (3A lo crea, 3B y "playing" lo usan)
 * y se libera al abrir otro nivel, al terminar o al cerrar el juego.
 */
export class LevelSession {
  private active: ActiveLevel | null = null;

  constructor(private readonly scene: Scene) {}

  get current(): ActiveLevel | null {
    return this.active;
  }

  /** Libera el nivel anterior (si hay) y abre el scope del nuevo. */
  begin(definition: LevelDefinition): LevelScope {
    this.end();
    const scope = new LevelScope(this.scene, definition.id);
    this.active = { definition, scope, map: null, strategy: null };
    return scope;
  }

  complete(map: LoadedMap): void {
    this.requireActive().map = map;
  }

  setStrategy(strategy: LevelStrategy): void {
    const active = this.requireActive();
    active.strategy?.dispose();
    active.strategy = strategy;
  }

  /** Libera solo la partida (strategy y lo que posee); el mapa sigue en pie. Estados 6 y 7. */
  disposeStrategy(): void {
    if (this.active?.strategy) {
      this.active.strategy.dispose();
      this.active.strategy = null;
    }
  }

  end(): void {
    this.disposeStrategy();
    this.active?.scope.dispose();
    this.active = null;
  }

  private requireActive(): ActiveLevel {
    if (!this.active) {
      throw new Error("[LevelSession] there is no level in progress");
    }
    return this.active;
  }
}
EOF

update_file "game/states/level-setup-state.ts" "91816114adf38c35067e8305017ac08a2ac15e041a0acff09ed48327ea7c0827" <<'EOF'
import type { GameState, GameStateTransitioner } from "../fsm/game-state";
import type { GameContext } from "../game-context";
import { createLevelStrategy } from "../levels/level-factory";
import type { LevelLoader, LevelLoadPhase } from "../levels/level-loader";
import type { LevelRepository } from "../levels/level-repository";
import type { LevelSession } from "../levels/level-session";
import { LoadingScreen } from "../screens/loading-screen";
import type { ScreenManager } from "../ui/screens/screen-manager";

const PHASE_LABELS: Record<LevelLoadPhase, string> = {
  downloading: "Downloading map",
  optimizing: "Optimizing map",
};

/**
 * Estado 3 — Configuración de nivel.
 *  3A: elige el próximo nivel pendiente (si no hay, va al estado 8), libera el anterior y carga
 *      la geometría con progreso real.
 *  3B: arma el strategy del nivel (por ahora sin Character, EnemiesManager ni HUD) y pasa a "playing".
 */
export class LevelSetupState implements GameState {
  readonly id = "level-setup" as const;

  private readonly screen = new LoadingScreen();
  private unsubscribeProgress: (() => void) | null = null;
  private exited = false;
  private ready = false;

  constructor(
    private readonly screens: ScreenManager,
    private readonly levels: LevelRepository,
    private readonly loader: LevelLoader,
    private readonly session: LevelSession,
    private readonly transitioner: GameStateTransitioner,
  ) {}

  async enter(context: GameContext): Promise<void> {
    this.exited = false;
    this.ready = false;

    const definition = this.levels.getNextPending();
    if (!definition) {
      this.session.end();
      this.goTo("game-finished");
      return;
    }

    const scope = this.session.begin(definition); // libera el nivel anterior
    this.screens.show(this.screen);
    this.screen.setProgress(null);
    this.screen.setStatus(`Preparing ${definition.id}`);
    this.unsubscribeProgress = this.loader.events.on("progressChanged", ({ phase, fraction }) => {
      this.screen.setProgress(fraction);
      this.screen.setStatus(PHASE_LABELS[phase]);
    });

    try {
      // 3A
      const map = await this.loader.load(definition, scope);
      if (!map || this.exited) {
        return; // cancelada: exit() ya liberó el nivel
      }
      this.session.complete(map);

      // 3B
      this.session.setStrategy(createLevelStrategy({ context, definition, scope }));
    } catch (error) {
      if (!this.exited) {
        this.screen.setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
      throw error;
    } finally {
      this.unsubscribeProgress?.();
      this.unsubscribeProgress = null;
    }

    this.ready = true;
    this.goTo("playing");
  }

  exit(): void {
    this.exited = true;
    this.unsubscribeProgress?.();
    this.unsubscribeProgress = null;
    this.screens.hide(this.screen);
    if (!this.ready) {
      this.session.end(); // carga a medias o fallida: se limpia. Si terminó, el nivel sigue vivo para "playing".
    }
  }

  /**
   * La transición se pide DESPUÉS de que enter() termine (macrotarea): así la FSM alcanza a
   * activar este estado y el log muestra el tiempo real de carga, en vez de una transición pisada.
   */
  private goTo(next: "playing" | "game-finished"): void {
    setTimeout(() => {
      if (!this.exited) {
        this.transitioner.transitionTo(next).catch(console.error);
      }
    }, 0);
  }
}
EOF

update_file "game/game.ts" "2f26ff3d22b9cb4174a8b33e553d500a09c36d12eef7ba318388179c54e238be" <<'EOF'
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
    const context: GameContext = { scene, engine, canvas };

    this.screens = new ScreenManager();
    this.input = new AnyInputService();
    this.hotkeys = new HotkeyService();
    this.assets = new AssetRegistry();
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
    const detachHud = attachGameDebugHud(this.fsm.events);
    const detachKeys = attachLevelDebugKeys(this.hotkeys, this.levelSession);
    this.detachDebugTools = () => {
      detachHud();
      detachKeys();
    };
  }
}
EOF

update_file "game/ui/screens/screens.css" "066be13462643d55f31d9d6c5f2b36d73aab46a962a45d4e20e71725ea304d34" <<'EOF'
.screen-root {
  --screen-bg: #05070d;
  --screen-fg: #e8f1ff;
  --screen-accent: #5cc8ff;
  --screen-gap: clamp(1.5rem, 6vh, 4rem);

  position: fixed;
  inset: 0;
  z-index: 100; /* debajo del DebugHud (1000) */
  display: flex;
}

.screen-root[hidden] {
  display: none;
}

.screen {
  flex: 1;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--screen-gap);
  padding:
    max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
    max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
  box-sizing: border-box;
  background: radial-gradient(ellipse at center, #0d1626 0%, var(--screen-bg) 70%);
  color: var(--screen-fg);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  text-align: center;
  user-select: none;
}

.screen__logo {
  width: min(70vw, 32rem);
  aspect-ratio: 16 / 9;
  display: grid;
  place-items: center;
  border: 2px dashed color-mix(in srgb, var(--screen-fg) 50%, transparent);
  border-radius: 0.75rem;
  font-size: clamp(1.25rem, 4vw, 2.5rem);
  font-weight: 700;
  letter-spacing: 0.15em;
}

.screen__title {
  margin: 0;
  font-size: clamp(1.25rem, 4vw, 2rem);
  letter-spacing: 0.25em;
  text-transform: uppercase;
}

.screen__prompt {
  margin: 0;
  font-size: clamp(0.9rem, 2.5vw, 1.25rem);
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--screen-accent);
  animation: screen-blink 1.4s ease-in-out infinite;
}

.screen__progress {
  width: min(70vw, 28rem);
  height: 0.5rem;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--screen-fg) 15%, transparent);
}

.screen__progress-bar {
  width: 40%;
  height: 100%;
  border-radius: inherit;
  background: var(--screen-accent);
  animation: screen-indeterminate 1.2s ease-in-out infinite;
}

@keyframes screen-blink {
  50% {
    opacity: 0.25;
  }
}

@keyframes screen-indeterminate {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(250%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .screen__prompt,
  .screen__progress-bar {
    animation: none;
  }
}

.screen__status {
  min-height: 1.5em;
  margin: 0;
  font-size: clamp(0.8rem, 2vw, 1rem);
  letter-spacing: 0.1em;
  opacity: 0.8;
}

.screen__progress--determinate .screen__progress-bar {
  width: calc(var(--progress, 0) * 100%);
  transform: none;
  animation: none;
  transition: width 0.2s ease-out;
}

/* Si el contenido no entra en pantalla (celulares chicos, landscape), la pantalla se desplaza. */
.screen-root {
  overflow-y: auto;
}

.screen__keymap {
  display: block;
  width: auto;
  height: auto;
  max-width: min(92vw, 64rem);
  max-height: 58dvh;
  object-fit: contain;
  border-radius: 0.75rem;
  box-shadow: 0 0 2rem color-mix(in srgb, var(--screen-accent) 25%, transparent);
}

/* Celulares en horizontal: se oculta el título para darle el alto a la imagen. */
@media (orientation: landscape) and (max-height: 32rem) {
  .screen--controls {
    gap: 0.75rem;
  }

  .screen--controls .screen__title {
    display: none;
  }

  .screen__keymap {
    max-height: 62dvh;
  }
}

.screen__brief {
  max-width: min(90vw, 40rem);
  margin: 0;
  font-size: clamp(1rem, 2.5vw, 1.25rem);
  line-height: 1.5;
  opacity: 0.9;
}
EOF

# game/levels/strategies ya tiene un archivo real: el .gitkeep de 002 sobra
rm -f game/levels/strategies/.gitkeep

setup_end