import { Axis, Space } from "@babylonjs/core/Maths/math.axis";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { Scene } from "@babylonjs/core/scene";

import type { CharacterAnimationSet } from "@/game/assets/animations/character-clip-names";
import type { AssetRegistry } from "@/game/assets/asset-registry";

import { CHARACTER_CAPSULE_HEIGHT, CHARACTER_CAPSULE_RADIUS, CHARACTER_MASS } from "../character.constants";
import { createWeaponPrefab } from "@/game/assets/factories/weapon-factory";
import { createThrusterPrefab } from "@/game/assets/factories/thruster-factory";
import { createShieldPrefab } from "@/game/assets/factories/shield-factory";

/** Prefijo de los nombres de todo lo creado acá: distingue al personaje de los prototipos del registro. */
const CHARACTER_PREFIX = "player:";
const CAPSULE_TESSELLATION = 16;
const CAPSULE_CAP_SUBDIVISIONS = 6;
const THRUSTER_GROUP_POSITION = { x: 0, y: 0.3, z: 0.06 }; // hombros/espalda, ajustar a ojo
const SHIELD_INITIAL_POSITION = { x: 0, y: 0.1, z: 0.5 }; // el offset por estado lo maneja character.base.ts

/** Mallas del modelo que no deben ser blanco del raycast de suelo (se busca por final del nombre). */
const CHARACTER_NON_PICKABLE_MESH_SUFFIXES = ["Alpha_Surface", "Alpha_Joints"];

export interface CharacterAndEquipmentBuildResult {
  characterMesh: Mesh;
  characterAggregate: PhysicsAggregate;
  characterAnimations: CharacterAnimationSet;
  weaponRoot: TransformNode;
  muzzle: TransformNode;
  thrusterGroup: TransformNode;
  thrusterLeft: Mesh;
  thrusterRight: Mesh;
  thrusterLeftNozzle: TransformNode;
  thrusterRightNozzle: TransformNode;
  shieldRoot: TransformNode;
  /**
   * Libera lo creado acá: personaje clonado y sus animaciones, arma, propulsores, escudo y cápsula.
   * El PhysicsAggregate lo libera el llamador (cambia al alternar de vehículo).
   */
  dispose(): void;
}

const disableModelPicking = (model: AbstractMesh): void => {
  let disabled = 0;
  for (const mesh of model.getChildMeshes()) {
    if (CHARACTER_NON_PICKABLE_MESH_SUFFIXES.some((suffix) => mesh.name.endsWith(suffix))) {
      mesh.isPickable = false;
      disabled++;
    }
  }
  if (disabled === 0) {
    console.warn(
      "characterAndEquipment_builder: no se encontraron las mallas del modelo a excluir del raycast " +
        `(${CHARACTER_NON_PICKABLE_MESH_SUFFIXES.join(", ")}). ¿Cambió el GLB? Si el ground-check se autodetecta, revisar.`,
    );
  }
};

export function characterAndEquipment_builder(
  scene: Scene,
  registry: AssetRegistry,
  spawn: Vector3,
): CharacterAndEquipmentBuildResult {
  const capsule = CreateCapsule(
    `${CHARACTER_PREFIX}capsule`,
    {
      height: CHARACTER_CAPSULE_HEIGHT,
      radius: CHARACTER_CAPSULE_RADIUS,
      tessellation: CAPSULE_TESSELLATION,
      capSubdivisions: CAPSULE_CAP_SUBDIVISIONS,
    },
    scene,
  );
  capsule.isVisible = false;
  capsule.isPickable = false;
  capsule.position.copyFrom(spawn); // ANTES de crear el PhysicsAggregate: Havok toma la posición al construirlo

  const characterInstance = registry.getCharacterInstance(CHARACTER_PREFIX);
  const model = characterInstance.mesh;
  model.parent = capsule;
  model.position.set(0, -(CHARACTER_CAPSULE_HEIGHT / 2), 0);
  model.rotate(Axis.Y, Math.PI, Space.LOCAL);
  disableModelPicking(model);

  // Equipo parenteado a la cápsula; los offsets por estado los maneja character.base.ts.
  const weapon = createWeaponPrefab(scene, CHARACTER_PREFIX);

  const thrusters = createThrusterPrefab(scene, CHARACTER_PREFIX);
  thrusters.group.parent = capsule;
  thrusters.group.position.set(THRUSTER_GROUP_POSITION.x, THRUSTER_GROUP_POSITION.y, THRUSTER_GROUP_POSITION.z);

  const shield = createShieldPrefab(scene, CHARACTER_PREFIX);
  shield.root.parent = capsule;
  shield.root.position.set(SHIELD_INITIAL_POSITION.x, SHIELD_INITIAL_POSITION.y, SHIELD_INITIAL_POSITION.z);

  const characterAggregate = new PhysicsAggregate(
    capsule,
    PhysicsShapeType.CAPSULE,
    { mass: CHARACTER_MASS, restitution: 0 },
    scene,
  );

  return {
    characterMesh: capsule,
    characterAggregate,
    characterAnimations: characterInstance.animations,
    weaponRoot: weapon.root,
    muzzle: weapon.muzzle,
    thrusterGroup: thrusters.group,
    thrusterLeft: thrusters.left,
    thrusterRight: thrusters.right,
    thrusterLeftNozzle: thrusters.leftNozzle,
    thrusterRightNozzle: thrusters.rightNozzle,
    shieldRoot: shield.root,
    dispose: () => {
      characterInstance.dispose();
      weapon.dispose();
      thrusters.dispose();
      shield.dispose();
      capsule.dispose(false, false);
    },
  };
}