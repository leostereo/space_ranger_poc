import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TypedEventEmitter } from "../core/events/typed-event-emitter";
import type { GameContext } from "../game-context";
import type { LevelDefinition } from "./level-definition";
import type { LoadedMap } from "./level-map-factory";
import type { LevelScope } from "./level-scope";

export type LevelOutcome = "completed" | "failed";

export interface LevelStrategyEventMap {
  levelFinished: { outcome: LevelOutcome };
}

export interface LevelStrategyDeps {
  readonly context: GameContext;
  readonly definition: LevelDefinition;
  readonly scope: LevelScope;
  readonly map: LoadedMap;
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
  protected readonly map: LoadedMap;

  private phase: Phase = "created";
  private pausedAnimationGroups: AnimationGroup[] = [];
  private physicsWasEnabled = true;

  constructor(deps: LevelStrategyDeps) {
    this.context = deps.context;
    this.definition = deps.definition;
    this.scope = deps.scope;
    this.map = deps.map;
  }

  /** Dónde debe aparecer el Character (definido por el nivel). */
  protected get characterSpawn(): Vector3 {
    return this.definition.spawns.character;
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
