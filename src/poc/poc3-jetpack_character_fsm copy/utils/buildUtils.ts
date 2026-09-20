// src/poc3-jetpack_character_fsm/utils/utils.ts
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { Axis, Quaternion, Space } from "@babylonjs/core";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { generalConfig } from "@/poc/config.general";
import { AssetManager, WeaponBuildResult, type ICharacterAnimations } from "@/services/assets-manager";
import { Tools } from "@babylonjs/lite-compat";

// TODO: mover a src/config.general.ts cuando se integre al repo real.
const TMP_CONFIG = {
  characterMass: 70,
  spawnHeight: 3,
  groundSize: 50,
};

const CHARACTER_NON_PICKABLE_MESH_NAMES = [
  "Alpha_Surface",
  "Alpha_Joints",
  "character.Armature.Alpha_Surface",
];

export function scene_builder(scene: Scene) {
  const light = AssetManager.getLight("main", false, "light");
  light.setEnabled(true);

  createPlatforms(scene);
  addMapAggregate(scene);

  //return [groundAggregate];
}


const platformsData = [
  { name: "ground-inicio", depth: 400, heightOffset: 0.0, zStart: 0 },
  { name: "ground-media", depth: 40, heightOffset: -100, zStart: 300 },
  { name: "ground-alta", depth: 80, heightOffset: 20, zStart: 300 },
  { name: "ground-baja", depth: 60, heightOffset: -260.0, zStart: 210 }  // Tercera plataforma (Baja, tras otro hueco de 15 unidades)
];

const createPlatforms = (scene: Scene) => {

  const { width, depth, thickness, friction, color } = generalConfig.ground;

  const material = AssetManager.getGridMaterial('grid-ground');

  platformsData.forEach((data) => {
    // A) Crear el Mesh de la plataforma individual
    const groundMesh = MeshBuilder.CreateBox(data.name, {
      width: width,
      depth: data.depth,
      height: thickness
    }, scene);

    // B) Posicionar la plataforma. 
    // Ajustamos la Y para que la parte superior de la caja quede exactamente en la altura deseada (heightOffset)
    groundMesh.position.set(0, data.heightOffset - (thickness / 2), data.zStart);
    groundMesh.material = material;

    // Hacemos que sea explícitamente detectable por el Raycast del controlador
    groundMesh.isPickable = true;

    new PhysicsAggregate(
      groundMesh,
      PhysicsShapeType.BOX,
      { mass: 0, friction, restitution: 0 },
      scene,
    );
  });
}

const addMapAggregate = (scene: Scene) => {
  const ground = scene.getMeshByName('FUSION_SUELO');
  if (ground) {
    const groundAggregate = new PhysicsAggregate(
      ground,
      PhysicsShapeType.MESH, // CAMBIADO: BOX → MESH, respeta el relieve real
      { mass: 0 },
      scene,
    );
  }

  const edificiosFusionados = scene.getMeshByName('FUSION_EDIFICIOS');

  if (edificiosFusionados) {
    const edificiosAggregate = new PhysicsAggregate(
      edificiosFusionados,
      PhysicsShapeType.MESH,
      { mass: 0 },
      scene,
    );
  }

};

export interface CharacterBuildResult {
  characterMesh: Mesh;
  characterAggregate: PhysicsAggregate;
  characterAnimations: ICharacterAnimations | null;
}

export interface CharacterAndEquipmentBuildResult extends CharacterBuildResult {
  weaponRoot: WeaponBuildResult["weaponRoot"];
  muzzle: WeaponBuildResult["muzzle"];
}

export function characterAndEquipment_builder(scene: Scene): CharacterAndEquipmentBuildResult {
  const capsuleResult = AssetManager.getMesh("character-capsule", "character-capsule");
  const characterResult = AssetManager.getMesh("character", "character");

  if (!capsuleResult || !characterResult) {
    throw new Error("AssetManager: 'character' o 'character-capsule' no disponibles (¿faltó awaitear cargarTodo()?).");
  }

  const capsule = capsuleResult.mesh as Mesh;
  const character = characterResult.mesh;

  capsule.position.y = TMP_CONFIG.spawnHeight;
  capsule.setEnabled(true);

  character.setEnabled(true);
  character.parent = capsule;

  const capsuleHeight = generalConfig.playerConfig.height;
  character.position.set(0, -(capsuleHeight / 2), 0);
  character.rotate(Axis.Y, Math.PI, Space.LOCAL);

  for (const meshName of CHARACTER_NON_PICKABLE_MESH_NAMES) {
    const mesh = scene.getMeshByName(meshName);
    if (mesh) {
      mesh.isPickable = false;
    } else {
      console.warn(
        `characterAndEquipment_builder: mesh esperado "${meshName}" no encontrado en la escena — ` +
        `¿cambió el export del GLB? Si el ground-check vuelve a autodetectarse, revisar esta lista.`,
      );
    }
  }

  const characterAggregate = new PhysicsAggregate(
    capsule,
    PhysicsShapeType.CAPSULE,
    { mass: TMP_CONFIG.characterMass, restitution: 0 },
    scene,
  );

  const camera = AssetManager.getCamera('follow', false, 'main_camera')
  camera.lockedTarget = character;
  scene.activeCamera = camera;

  // Weapon: parenteado simple a la cápsula, con offsets manuales por estado (ver WEAPON_OFFSETS
  // en character.base.ts / OnGroundFsm / OnGroundCrouchedFsm). Se intentó attachToBone acá pero
  // se descartó por un desfasaje de handedness entre bone-space y world-space no resuelto —
  // ver nota en config si se retoma con un modelo nuevo.
  const weaponResult = AssetManager.getWeapon();
  if (!weaponResult) {
    throw new Error("characterAndEquipment_builder: no se pudo obtener 'player_weapon' del AssetManager.");
  }
  const { weaponRoot, muzzle } = weaponResult;

  return {
    characterMesh: capsule,
    characterAggregate,
    characterAnimations: characterResult.animations,
    weaponRoot,
    muzzle,
  };
}