import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { Scene } from "@babylonjs/core/scene";

import type { StaticShape } from "./level-definition";
import type { LoadedMap } from "./level-map-factory";
import type { LevelScope } from "./level-scope";

const STATIC_MASS = 0; // estático
const STATIC_FRICTION = 0.8; // TODO: usar el valor de la config del POC
const STATIC_RESTITUTION = 0; // sin rebote al aterrizar

const SHAPE_TYPES: Record<StaticShape, PhysicsShapeType> = {
  box: PhysicsShapeType.BOX,
  mesh: PhysicsShapeType.MESH,
};

/**
 * Crea el cuerpo físico estático de los suelos y de las mallas sólidas del nivel. Se liberan con el scope.
 * Devuelve el cuerpo de cada malla, por si la strategy necesita luego destruirlo o volverlo dinámico.
 */
export function createGroundPhysics(map: LoadedMap, scene: Scene, scope: LevelScope): ReadonlyMap<Mesh, PhysicsAggregate> {
  const bodies = new Map<Mesh, PhysicsAggregate>();
  if (!scene.isPhysicsEnabled()) {
    console.warn("[createGroundPhysics] the scene has no physics engine enabled: grounds have no body");
    return bodies;
  }

  const addBody = (mesh: Mesh, shape: StaticShape): void => {
    bodies.set(
      mesh,
      scope.register(
        new PhysicsAggregate(
          mesh,
          SHAPE_TYPES[shape],
          { mass: STATIC_MASS, friction: STATIC_FRICTION, restitution: STATIC_RESTITUTION },
          scene,
        ),
      ),
    );
  };

  for (const ground of map.grounds) {
    addBody(ground, map.groundShapes.get(ground) ?? "box");
  }
  for (const solid of map.solids) {
    addBody(solid.mesh, solid.shape);
  }
  return bodies;
}