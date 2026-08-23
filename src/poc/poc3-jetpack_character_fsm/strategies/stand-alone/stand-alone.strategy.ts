// src/poc3-jetpack_character_fsm/strategies/stand-alone/stand-alone.strategy.ts
import type { Scene } from "@babylonjs/core/scene";
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { ICharacterAnimations } from "@/services/assets-manager";
import type { IVehicleStrategy } from "../contracts/ivehicle-strategy";
import type { CharacterFsm } from "../../character-fsm/character.fsm";
import type { CharacterInput } from "../../character.input";
import { StandAlonePhysicsController } from "./stand-alone.physics.controller";
import { StandAloneInputController } from "./stand-alone.input.controller";
import { StandAloneAnimationController } from "./stand-alone.animation.controller";

export interface StandAloneStrategyResult {
  strategy: IVehicleStrategy;
  /**
   * Referencia concreta (no la interfaz genérica) para que character.base.ts pueda leer
   * isGroundDetected()/applyJumpImpulse() sin castear IPhysicsController — mismo criterio
   * que JetpackStrategyResult.physicsController para hasFuel().
   */
  physicsController: StandAlonePhysicsController;
}

/**
 * Factory async por convención del repo (mismo criterio que build() en otros POCs).
 * `characterAnimations` viene de character.base.ts (construido una sola vez junto con
 * characterMesh/characterAggregate, ver utils.ts) — esta factory NO carga ni clona nada.
 * `scene` se agrega para el raycast de ground detection (ver stand-alone.physics.controller.ts).
 */
export async function buildStandAloneStrategy(
  scene: Scene,
  characterAggregate: PhysicsAggregate,
  input: CharacterInput,
  characterFsm: CharacterFsm,
  characterAnimations: ICharacterAnimations | null,
): Promise<StandAloneStrategyResult> {
  const physics = new StandAlonePhysicsController(scene, characterAggregate, () => input.current);
  const inputController = new StandAloneInputController(input, characterFsm);
  const animation = new StandAloneAnimationController(characterAnimations, characterFsm.standAloneSubFsm);

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