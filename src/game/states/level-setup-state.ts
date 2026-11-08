// src/game/states/level-setup-state.ts
import type { GameState, GameStateTransitioner } from "../fsm/game-state";
import type { GameContext } from "../game-context";
import CharacterBase from "../entities/character/character.base";
import { createGroundPhysics } from "../levels/ground-physics";
import { createLevelStrategy } from "../levels/level-factory";
import type { LevelLoader, LevelLoadPhase } from "../levels/level-loader";
import type { LevelRepository } from "../levels/level-repository";
import type { LevelSession } from "../levels/level-session";
import { LoadingScreen } from "../screens/loading-screen";
import type { ScreenManager } from "../ui/screens/screen-manager";
import { createEnemiesManager } from "../entities/enemies/enemy-factory";
import { VolumePointSampler } from "../navigation/volume-point-sampler";
import { Skybox } from "../levels/skybox";

const PHASE_LABELS: Record<LevelLoadPhase, string> = {
  downloading: "Downloading map",
  optimizing: "Optimizing map",
  building: "Building map",
};

/**
 * Estado 3 — Configuración de nivel.
 *  3A: Elige el próximo nivel pendiente, libera el anterior y carga la geometría.
 *  3B: Arma el strategy del nivel inyectando de forma nativa mallas, personajes y enemigos.
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

    const scope = this.session.begin(definition); // Libera recursos del nivel anterior
    this.screens.show(this.screen);
    this.screen.setProgress(null);
    this.screen.setStatus(`Preparing ${definition.id}`);
    this.unsubscribeProgress = this.loader.events.on("progressChanged", ({ phase, fraction }) => {
      this.screen.setProgress(fraction);
      this.screen.setStatus(PHASE_LABELS[phase]);
    });

    try {
      // 🟢 FASE 3A: Carga e Infraestructura de la Geometría
      const map = await this.loader.load(definition, scope);
      if (!map || this.exited) {
        return; 
      }

      if (definition.skybox) {
        scope.register(await Skybox.create(context.scene, definition.skybox));
      }
      if (this.exited) {
        return;
      }
      this.session.complete(map);

      // 🟢 FASE 3B: Ensamblado Dinámico y Orquestación Core
      createGroundPhysics(map, context.scene, scope);
      
      const character = await CharacterBase.create(context.scene, context.assets, definition.spawns.character, context.input);
      if (this.exited) {
        character.dispose();
        return;
      }
      scope.register(character); 
      
      const navigation = scope.register(new VolumePointSampler()); 
      
      const enemies = scope.register(
        createEnemiesManager(definition.spawns.enemies, {
          scene: context.scene,
          registry: context.assets,
          isPlayerMesh: (mesh) => character.isPlayerMesh(mesh),
          navigation,
        }),
      );

      // 🟢 FIX DE INYECCIÓN DATA-DRIVEN: 
      // Se arma la estrategia pasando de forma nativa e incondicional 'managedUnits'.
      // Si el mapa procedural las creó (Nivel 8), las inyecta en caliente. Si no (Niveles 1-7), manda un array vacío seguro.
      this.session.setStrategy(
        createLevelStrategy({ 
          context, 
          definition, 
          scope, 
          map, 
          character, 
          enemies,
          managedUnits: map.managedUnits ?? []  
        })
      );
        
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
      this.session.end(); 
    }
  }

  private goTo(next: "playing" | "game-finished"): void {
    setTimeout(() => {
      if (!this.exited) {
        this.transitioner.transitionTo(next).catch(console.error);
      }
    }, 0);
  }
}
