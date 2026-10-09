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
