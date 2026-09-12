// src/poc3-jetpack_character_fsm/strategies/jetpack/jetpack.strategy.ts
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { ICharacterAnimations } from "@/services/assets-manager";
import type { IVehicleStrategy } from "../contracts/ivehicle-strategy";
import type { CharacterFsm } from "../../character-fsm/character.fsm";
import type { CharacterInput } from "../../character.input";
import { JetpackPhysicsController } from "./jetpack.physics.controller";
import { JetpackInputController } from "./jetpack.input.controller";
import { JetpackAnimationController } from "./jetpack.animation.controller";
import { AbstractMesh, Scene, TransformNode } from "@babylonjs/core";
import { ProjectileWeaponController } from "../weapon/projectile-weapon.controller";

export interface JetpackStrategyResult {
  strategy: IVehicleStrategy;
  physicsController: JetpackPhysicsController;
}

export async function buildJetpackStrategy(
  scene: Scene,
  characterAggregate: PhysicsAggregate,
  input: CharacterInput,
  characterFsm: CharacterFsm,
  characterAnimations: ICharacterAnimations | null,
  weaponMuzzle: TransformNode,
): Promise<JetpackStrategyResult> {
  const physics = new JetpackPhysicsController(
    characterAggregate,
    () => input.current,
    () => characterFsm.jetpackSubFsm.getState(),
  );
  const inputController = new JetpackInputController(input, characterFsm);
  const animation = new JetpackAnimationController(characterAnimations, characterFsm.jetpackSubFsm);
  const weapon = new ProjectileWeaponController(
    scene,
    weaponMuzzle,
    () => characterFsm.jetpackSubFsm.getState() === "Shooting", // CAMBIADO — el predicado ahora vive acá, no adentro del controller
    [characterAggregate.transformNode as AbstractMesh],
  );

  const strategy: IVehicleStrategy = {
    physics,
    input: inputController,
    animation,
    tick(dt: number) {
      inputController.tick();
      physics.tick(dt);
      animation.tick();
      weapon.tick(dt);
    },
    dispose() {
      physics.dispose();
      inputController.dispose();
      animation.dispose();
      weapon.dispose();
    },
  };

  return { strategy, physicsController: physics };
}