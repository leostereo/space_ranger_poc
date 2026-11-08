// src/game/level-strategy.ts
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TypedEventEmitter } from "../core/events/typed-event-emitter";
import type { GameContext } from "../game-context";
import type CharacterBase from "../entities/character/character.base";
import type { LevelDefinition } from "./level-definition";
import type { LoadedMap } from "./level-map-factory";
import type { LevelScope } from "./level-scope";
import { createLevelLighting } from "./level-lighting";
import type { EnemiesManager } from "../entities/enemies/enemies-manager";
import { PlayerShotDebugEmitter } from "../debug/player-shot-debug-emitter";
import type { ManagedUnitInstance } from "./unit-builder.types";

export type LevelOutcome = "completed" | "failed";

export interface LevelStrategyEventMap {
  levelFinished: { outcome: LevelOutcome };
}

export interface LevelStrategyDeps {
  readonly context: GameContext;
  readonly definition: LevelDefinition;
  readonly scope: LevelScope;
  readonly map: LoadedMap;
  readonly character: CharacterBase;
  readonly enemies: EnemiesManager;
  readonly managedUnits: ManagedUnitInstance[]; // 🟢 OBLIGATORIO A PARTIR DE AHORA
}

type Phase = "created" | "playing" | "paused" | "finished" | "disposed";

export abstract class LevelStrategy {
  readonly DEATH_TO_GAME_OVER_DELAY_SECONDS = 2.5;
  readonly events = new TypedEventEmitter<LevelStrategyEventMap>();

  protected readonly context: GameContext;
  protected readonly definition: LevelDefinition;
  protected readonly scope: LevelScope;
  protected readonly map: LoadedMap;
  protected readonly character: CharacterBase;
  protected readonly enemies: EnemiesManager;
  protected readonly _managedUnits: ManagedUnitInstance[]; // 🟢 Visible para subclases

  private phase: Phase = "created";
  private pausedAnimationGroups: AnimationGroup[] = [];
  private physicsWasEnabled = true;
  private shotDebugEmitter: PlayerShotDebugEmitter | null = null;

  constructor(deps: LevelStrategyDeps) {
    this.context = deps.context;
    this.definition = deps.definition;
    this.scope = deps.scope;
    this.map = deps.map;
    this.character = deps.character;
    this.enemies = deps.enemies;
    this._managedUnits = deps.managedUnits; // 🟢 Inyección core
    
    createLevelLighting(this.context.scene, this.scope);
    if (import.meta.env.DEV) {
      this.shotDebugEmitter = new PlayerShotDebugEmitter();
    }
  }

  protected get characterSpawn(): Vector3 {
    return this.definition.spawns.character;
  }

  play(): void {
    if (this.phase !== "created") {
      throw new Error(`[LevelStrategy] play() called in phase "${this.phase}"`);
    }
    this.phase = "playing";
    this.character.activateCamera();
    this.onPlay();
  }

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
    this.enemies.pause();
    this.onPause();
  }

  resume(): void {
    if (this.phase !== "paused") {
      return;
    }
    this.phase = "playing";
    this.context.scene.physicsEnabled = this.physicsWasEnabled;
    this.pausedAnimationGroups.forEach((group) => group.restart());
    this.pausedAnimationGroups = [];
    this.enemies.resume();
    this.onResume();
  }

  tick(deltaTime: number): void {
    if (this.phase !== "playing") {
      return;
    }
    this.character.update(deltaTime);
    
    const currentCharacterPos = this.character.position;
    this.enemies.update(deltaTime, currentCharacterPos);
    
    this.onTick(deltaTime);    
    if (this.phase !== "playing") {
      return;
    }
    if (this.checkWin()) {
      this.finish("completed");
    } else if (this.checkLose()) {
      this.finish("failed");
    }
  }

  forceOutcome(outcome: LevelOutcome): void {
    if (this.phase === "playing") {
      this.finish(outcome);
    }
  }

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

  protected finish(outcome: LevelOutcome): void {
    if (this.phase !== "playing") {
      return;
    }
    this.phase = "finished";
    if (outcome === "failed") {
      this.enemies.gameOver();
    }
    this.events.emit("levelFinished", { outcome });
  }
}
