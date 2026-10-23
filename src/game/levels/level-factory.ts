import { Level01Strategy } from "./strategies/level-01-strategy";
import type { LevelStrategy, LevelStrategyDeps } from "./level-strategy";
import { Level02Strategy } from "./strategies/level-02-strategy";
import { Level03Strategy } from "./strategies/level-03-strategy";
import { Level04Strategy } from "./strategies/level-04-strategy";
import { Level05Strategy } from "./strategies/level-05-strategy";
import { Level06Strategy } from "./strategies/level-06-strategy";
import { Level07Strategy } from "./strategies/level-07-strategy";

type StrategyBuilder = (deps: LevelStrategyDeps) => LevelStrategy;

/** Un strategy concreto por nivel. Para agregar uno: crear la clase y registrarla acá. */
const STRATEGY_BUILDERS: Readonly<Record<string, StrategyBuilder>> = {
  "level-01": (deps) => new Level01Strategy(deps),
  "level-02": (deps) => new Level02Strategy(deps),
  "level-03": (deps) => new Level03Strategy(deps),
  "level-04": (deps) => new Level04Strategy(deps),
  "level-05": (deps) => new Level05Strategy(deps),
  "level-06": (deps) => new Level06Strategy(deps),
  "level-07": (deps) => new Level07Strategy(deps),
}
  ;

/** Estado 3B: arma el strategy del nivel (y, a futuro, Character, EnemiesManager y HUD que se le inyectan). */
export function createLevelStrategy(deps: LevelStrategyDeps): LevelStrategy {
  const build = STRATEGY_BUILDERS[deps.definition.id];
  if (!build) {
    throw new Error(`[createLevelStrategy] there is no strategy registered for the level "${deps.definition.id}"`);
  }
  return build(deps);
}
