import { Level01Strategy } from "./strategies/level-01-strategy";
import type { LevelStrategy, LevelStrategyDeps } from "./level-strategy";
import { Level02Strategy } from "./strategies/level-02-strategy";

type StrategyBuilder = (deps: LevelStrategyDeps) => LevelStrategy;

/** Un strategy concreto por nivel. Para agregar uno: crear la clase y registrarla acá. */
const STRATEGY_BUILDERS: Readonly<Record<string, StrategyBuilder>> = {
  "level-01": (deps) => new Level01Strategy(deps),
  "level-02": (deps) => new Level02Strategy(deps),
};

/** Estado 3B: arma el strategy del nivel (y, a futuro, Character, EnemiesManager y HUD que se le inyectan). */
export function createLevelStrategy(deps: LevelStrategyDeps): LevelStrategy {
  const build = STRATEGY_BUILDERS[deps.definition.id];
  if (!build) {
    throw new Error(`[createLevelStrategy] there is no strategy registered for the level "${deps.definition.id}"`);
  }
  return build(deps);
}
