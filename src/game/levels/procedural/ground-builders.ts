import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";

import type { ProceduralMapSource } from "../level-definition";

const DEFAULT_GROUND_NAME = "ground";
const DEFAULT_GROUND_COLOR = new Color3(0.35, 0.38, 0.42);

const DEFAULT_LANDING_GROUND_NAME = "landing-ground";
export const LANDING_GROUND_SIZE = 3;
const DEFAULT_LANDING_GROUND_COLOR = new Color3(0.2, 0.55, 0.35);

export interface GroundOptions {
  readonly width: number;
  readonly depth: number;
  /** Nombre de la malla. Si un nivel usa varios, conviene que sean distintos. */
  readonly name?: string;
  readonly color?: Color3;
  readonly position?: Vector3;
}

export type LandingGroundOptions = Omit<GroundOptions, "width" | "depth">;

/** Suelo rectangular. Es una fuente procedural lista para usar en `maps`. */
export function buildGround(options: GroundOptions): ProceduralMapSource {
  const {
    width,
    depth,
    name = DEFAULT_GROUND_NAME,
    color = DEFAULT_GROUND_COLOR,
    position = Vector3.Zero(),
  } = options;

  return {
    kind: "procedural",
    build: ({ scene }) => {
      const ground = CreateGround(name, { width, height: depth }, scene);
      ground.position.copyFrom(position);

      const material = new StandardMaterial(`${name}-material`, scene);
      material.diffuseColor = color;
      material.specularColor = Color3.Black();
      ground.material = material;

      return { ground };
    },
  };
}

/** Plataforma de aterrizaje de 3 x 3: igual que `buildGround` pero de tamaño fijo. */
export function buildLandingGround(options: LandingGroundOptions = {}): ProceduralMapSource {
  return buildGround({
    width: LANDING_GROUND_SIZE,
    depth: LANDING_GROUND_SIZE,
    name: DEFAULT_LANDING_GROUND_NAME,
    color: DEFAULT_LANDING_GROUND_COLOR,
    ...options,
  });
}