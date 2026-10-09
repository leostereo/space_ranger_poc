import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

import type { LevelScope } from "./level-scope";

/** Luz general del nivel (hemisférica, desde arriba). Se libera junto con el scope. */
export function createLevelLighting(scene: Scene, scope: LevelScope): HemisphericLight {
  return scope.register(new HemisphericLight("level-light", Vector3.Up(), scene));
}