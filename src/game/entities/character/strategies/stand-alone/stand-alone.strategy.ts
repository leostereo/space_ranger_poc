// src/poc3-jetpack_character_fsm/strategies/stand-alone/stand-alone.strategy.ts
import type { Scene } from "@babylonjs/core/scene";
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { CharacterAnimationSet } from "@/game/assets/animations/character-clip-names";
import type { IVehicleStrategy } from "../contracts/ivehicle-strategy";
import type { CharacterFsm } from "../../character-fsm/character.fsm";
import type { CharacterInput } from "../../character.input";
import { StandAlonePhysicsController } from "./stand-alone.physics.controller";
import { StandAloneInputController } from "./stand-alone.input.controller";
import { StandAloneAnimationController } from "./stand-alone.animation.controller";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { ProjectileWeaponController } from "../weapon/projectile-weapon.controller";
import type { CombatRules } from "../../utils/combat-rules";

export interface StandAloneStrategyResult {
  strategy: IVehicleStrategy;
  /**
   * Referencia concreta (no la interfaz genérica) para que character.base.ts pueda leer
   * isGroundDetected()/applyJumpImpulse() sin castear IPhysicsController — mismo criterio
   * que JetpackStrategyResult.physicsController para hasFuel().
   */
  physicsController: StandAlonePhysicsController;
}

export async function buildStandAloneStrategy(
  scene: Scene,
  characterAggregate: PhysicsAggregate,
  input: CharacterInput,
  characterFsm: CharacterFsm,
  characterAnimations: CharacterAnimationSet | null,
  weaponMuzzle: TransformNode, // NUEVO — antes del último param opcional
  combat: CombatRules, // NUEVO — antes del último param opcional
  initialGroundDetectedOverride?: boolean,

): Promise<StandAloneStrategyResult> {
  const initialGroundDetected = initialGroundDetectedOverride ?? (characterFsm.standAloneSubFsm.getState() !== "OnAir");
  const physics = new StandAlonePhysicsController(
    scene,
    characterAggregate,
    () => input.current,
    initialGroundDetected,
    () => characterFsm.standAloneSubFsm.getActiveSubState(), // NUEVO
  ); const inputController = new StandAloneInputController(input, characterFsm);


  const animation = new StandAloneAnimationController(
    characterAnimations, characterFsm.standAloneSubFsm, combat.isAiming, combat.isShielding,
  );
  const weapon = new ProjectileWeaponController(
    scene,
    weaponMuzzle,
    combat.isAiming,
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
      weapon.tick(dt); // NUEVO
    },
    dispose() {
      physics.dispose();
      inputController.dispose();
      animation.dispose();
      weapon.dispose(); // NUEVO
    },
  };

  return { strategy, physicsController: physics };
}
