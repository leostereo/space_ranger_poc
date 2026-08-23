// src/poc3-jetpack_character_fsm/strategies/no-vehicle/no-vehicle.strategy.ts
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { IVehicleStrategy } from "../contracts/ivehicle-strategy";
import type { CharacterFsm } from "../../character-fsm/character.fsm";
import type { CharacterInput } from "../../character.input";
import { NoVehiclePhysicsController } from "./no-vehicle.physics.controller";
import { NoVehicleInputController } from "./no-vehicle.input.controller";
import { NoVehicleAnimationController } from "./no-vehicle.animation.controller";

/**
 * Factory async por convención del repo (mismo criterio que build() en otros POCs), aunque
 * acá todavía no haya nada que esperar de verdad — deja el punto de extensión listo para
 * cuando NoVehicle necesite cargar un modelo animado real.
 */
export async function buildNoVehicleStrategy(
  characterAggregate: PhysicsAggregate,
  input: CharacterInput,
  characterFsm: CharacterFsm,
): Promise<IVehicleStrategy> {
  const physics = new NoVehiclePhysicsController(characterAggregate, () => input.current);
  const inputController = new NoVehicleInputController(input, characterFsm);
  const animation = new NoVehicleAnimationController();

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
