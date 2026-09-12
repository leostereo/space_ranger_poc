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
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { ProjectileWeaponController } from "../weapon/projectile-weapon.controller";

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
  characterAnimations: ICharacterAnimations | null,
  weaponMuzzle: TransformNode, // NUEVO — antes del último param opcional
  initialGroundDetectedOverride?: boolean,

): Promise<StandAloneStrategyResult> {
  const initialGroundDetected = initialGroundDetectedOverride ?? (characterFsm.standAloneSubFsm.getState() !== "OnAir");
  const physics = new StandAlonePhysicsController(scene, characterAggregate, () => input.current, initialGroundDetected);
  const inputController = new StandAloneInputController(input, characterFsm);

  // Único predicado — determina si se dispara, si el arma es visible, y si toca la
  // animación de apuntado en vez de la normal. Restringido a Idle/Walking/Running: no
  // durante JumpImpulseStart/OnAir/LandingX/EquippingHoverBoardStart.
  const isAimingActive = (): boolean => {
    const groundState = characterFsm.getActiveSubState();
    const canAimHere = groundState === "Idle" || groundState === "Walking" || groundState === "Running";
    return canAimHere && input.current.shoot;
  };

  const animation = new StandAloneAnimationController(characterAnimations, characterFsm.standAloneSubFsm, isAimingActive); // CAMBIADO
  const weapon = new ProjectileWeaponController( // NUEVO
    scene,
    weaponMuzzle,
    isAimingActive,
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
