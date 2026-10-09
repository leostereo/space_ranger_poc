import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { Scene } from "@babylonjs/core/scene";

import type { LoadedMap } from "./level-map-factory";
import type { LevelScope } from "./level-scope";

const GROUND_MASS = 0; // estático
const GROUND_FRICTION = 0.8; // TODO: usar el valor de la config del POC
const GROUND_RESTITUTION = 0; // sin rebote al aterrizar

/** Crea el cuerpo físico de todos los suelos del nivel. Se liberan junto con el scope. */
export function createGroundPhysics(map: LoadedMap, scene: Scene, scope: LevelScope): void {
  if (!scene.isPhysicsEnabled()) {
    console.warn("[createGroundPhysics] the scene has no physics engine enabled: grounds have no body");
    return;
  }

  for (const ground of map.grounds) {
    scope.register(
      new PhysicsAggregate(
        ground,
        PhysicsShapeType.BOX,
        { mass: GROUND_MASS, friction: GROUND_FRICTION, restitution: GROUND_RESTITUTION },
        scene,
      ),
    );
  }
}