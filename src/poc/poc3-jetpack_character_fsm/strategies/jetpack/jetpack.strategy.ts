// src/poc3-jetpack_character_fsm/strategies/jetpack/jetpack.strategy.ts
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { ICharacterAnimations } from "@/services/assets-manager";
import type { IVehicleStrategy } from "../contracts/ivehicle-strategy";
import type { CharacterFsm } from "../../character-fsm/character.fsm";
import type { CharacterInput } from "../../character.input";
import { JetpackPhysicsController } from "./jetpack.physics.controller";
import { JetpackInputController } from "./jetpack.input.controller";
import { JetpackAnimationController } from "./jetpack.animation.controller";

export interface JetpackStrategyResult {
  strategy: IVehicleStrategy;
  physicsController: JetpackPhysicsController;
}

export async function buildJetpackStrategy(
  characterAggregate: PhysicsAggregate,
  input: CharacterInput,
  characterFsm: CharacterFsm,
  characterAnimations: ICharacterAnimations | null,
): Promise<JetpackStrategyResult> {
  const physics = new JetpackPhysicsController(
    characterAggregate,
    () => input.current,
    () => characterFsm.jetpackSubFsm.getState(),
  );
  const inputController = new JetpackInputController(input, characterFsm);
  const animation = new JetpackAnimationController(characterAnimations, characterFsm.jetpackSubFsm);

  const strategy: IVehicleStrategy = {
    physics,
    input: inputController,
    animation,
    tick(dt: number) {
      inputController.tick();
      physics.tick(dt);
      animation.tick();
    },
    dispose() {
      physics.dispose();
      inputController.dispose();
      animation.dispose();
    },
  };

  return { strategy, physicsController: physics };
}