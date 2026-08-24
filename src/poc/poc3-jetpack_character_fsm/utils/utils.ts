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

export function scene_builder(scene: Scene): PhysicsAggregate[] {
  const light = AssetManager.getLight("main", false, "light");
  light.setEnabled(true);

  // TODO: reemplazar por AssetManager.getMesh('ground-basic' | 'ground-grid', ...) cuando
  // _builGrounds() esté activo en AssetManager (hoy está comentado ahí).
  const ground = MeshBuilder.CreateGround("ground", { width: TMP_CONFIG.groundSize, height: TMP_CONFIG.groundSize }, scene);
  const groundAggregate = new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);

  // const mapResult = AssetManager.getMesh('batalla del pilar','map')
  // const map = mapResult?.mesh as Mesh;
  // map.position.y = 300;
  // map.rotation._x = Tools.ToRadians(-60);

  return [groundAggregate];
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

  const characterAggregate = new PhysicsAggregate(
    capsule,
    PhysicsShapeType.CAPSULE,
    { mass: TMP_CONFIG.characterMass },
    scene,
  );

  return {
    characterMesh: capsule,
    characterAggregate,
    characterAnimations: characterResult.animations,
  };
}