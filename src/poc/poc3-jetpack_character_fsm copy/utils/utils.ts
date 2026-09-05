// src/poc3-jetpack_character_fsm/utils/utils.ts
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { Axis, Space } from "@babylonjs/core";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { generalConfig } from "@/poc/config.general";
import { AssetManager, type ICharacterAnimations } from "@/services/assets-manager";
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

export interface CharacterBuildResult {
  characterMesh: Mesh;
  characterAggregate: PhysicsAggregate;
  /**
   * Diccionario semántico ya preparado por AssetManager (blending activado, todo parado).
   * Construido UNA sola vez acá, igual que characterMesh/characterAggregate — se pasa por
   * referencia a la strategy activa (StandAlone o Jetpack), nunca se dispone al swapear
   * strategy, sólo cuando character.base.ts se dispone del todo. Puede ser null si
   * AssetManager no pudo armar el molde (ver warning en consola).
   */
  characterAnimations: ICharacterAnimations | null;
}

/**
 * Construye UNA sola vez el mesh/aggregate/animaciones del personaje. A diferencia de poc2
 * (donde boardMesh/boardAggregate representan un vehículo separado del personaje), acá
 * StandAlone y Jetpack son el MISMO cuerpo físico — sólo cambia qué controller le aplica
 * fuerzas. Por eso esto vive en character.base.ts (dueño único), no en cada strategy.
 *
 * `capsule` (invisible) es la que lleva el PhysicsAggregate y por lo tanto la que se
 * devuelve como characterMesh. `character` (el GLB visible) se parentea a la cápsula para
 * seguir su transform físico automáticamente — mismo criterio que AssetManager usa
 * internamente para pegar tailMesh a boardMesh.
 *
 * El offset/rotación del GLB dentro de la cápsula está portado de
 * board_character_builder() en poc2 (mismo problema: el origen del modelo no coincide con
 * el centro de la cápsula, y el modelo mira para el lado contrario). ÚNICA diferencia:
 * poc2 hardcodea `capsuleHeight = 2` ("ajustá según la altura de tu cápsula") — acá se
 * toma de `generalConfig.playerConfig.height`, la MISMA fuente que usa AssetManager para
 * construir la cápsula, para que nunca se desincronicen.
 */
export function character_builder(scene: Scene): CharacterBuildResult {
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

  // Offset + rotación portados de poc2 (board_character_builder): el origen del GLB
  // está en el centro del modelo, no en los pies, y el modelo arranca mirando al revés.
  const capsuleHeight = generalConfig.playerConfig.height;
  character.position.set(0, -(capsuleHeight / 2), 0);
  character.rotate(Axis.Y, Math.PI, Space.LOCAL);

  for (const meshName of CHARACTER_NON_PICKABLE_MESH_NAMES) {
    const mesh = scene.getMeshByName(meshName);
    if (mesh) {
      mesh.isPickable = false;
    } else {
      console.warn(
        `character_builder: mesh esperado "${meshName}" no encontrado en la escena — ` +
        `¿cambió el export del GLB? Si el ground-check vuelve a autodetectarse, revisar esta lista.`,
      );
    }
  }

  const characterAggregate = new PhysicsAggregate(
    capsule,
    PhysicsShapeType.CAPSULE,
    { mass: TMP_CONFIG.characterMass },
    scene,
  );

  const camera = AssetManager.getCamera('follow', false, 'main_camera')
  camera.lockedTarget = character;
  scene.activeCamera = camera;

  return {
    characterMesh: capsule,
    characterAggregate,
    characterAnimations: characterResult.animations,
  };
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