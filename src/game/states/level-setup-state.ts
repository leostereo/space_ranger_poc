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
