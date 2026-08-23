// src/poc3-jetpack_character_fsm/strategies/stand-alone/stand-alone.strategy.ts
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { ICharacterAnimations } from "@/services/assets-manager";
import type { IVehicleStrategy } from "../contracts/ivehicle-strategy";
import type { CharacterFsm } from "../../character-fsm/character.fsm";
import type { CharacterInput } from "../../character.input";
import { StandAlonePhysicsController } from "./stand-alone.physics.controller";
import { StandAloneInputController } from "./stand-alone.input.controller";
import { StandAloneAnimationController } from "./stand-alone.animation.controller";

/**
 * Factory async por convención del repo (mismo criterio que build() en otros POCs).
 * `characterAnimations` viene de character.base.ts (construido una sola vez junto con
 * characterMesh/characterAggregate, ver utils.ts) — esta factory NO carga ni clona nada.
 */
export async function buildStandAloneStrategy(
  characterAggregate: PhysicsAggregate,
  input: CharacterInput,
  characterFsm: CharacterFsm,
  characterAnimations: ICharacterAnimations | null,
): Promise<IVehicleStrategy> {
  const physics = new StandAlonePhysicsController(characterAggregate, () => input.current);
  const inputController = new StandAloneInputController(input, characterFsm);
  const animation = new StandAloneAnimationController(characterAnimations, characterFsm.standAloneSubFsm);

  return {
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
}