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
  /**
   * Referencia concreta (no la interfaz genérica) para que character.base.ts pueda leer
   * hasFuel() sin castear IPhysicsController — hasFuel() es específico de Jetpack, no
   * pertenece al contrato genérico.
   */
  physicsController: JetpackPhysicsController;
}

/**
 * Async por convención — thruster.ts queda para el final, según lo acordado.
 * `characterAnimations` viene de character.base.ts, mismo criterio que en
 * buildStandAloneStrategy. `characterFsm` se agrega para que el animation controller
 * pueda leer/suscribirse a `characterFsm.jetpackSubFsm` (antes no tenía forma de
 * comunicarse con la fsm — ver aclaración en jetpack.animation.controller.ts).
 */
export async function buildJetpackStrategy(
  characterAggregate: PhysicsAggregate,
  input: CharacterInput,
  characterFsm: CharacterFsm,
  characterAnimations: ICharacterAnimations | null,
): Promise<JetpackStrategyResult> {
  const physics = new JetpackPhysicsController(characterAggregate, () => input.current);
  const inputController = new JetpackInputController();
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