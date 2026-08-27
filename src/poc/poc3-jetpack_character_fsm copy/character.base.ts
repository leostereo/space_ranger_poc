import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Nullable } from "@babylonjs/core/types";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { AnimationEvent } from "@babylonjs/core";
import type { ICharacterAnimations } from "@/services/assets-manager";
import { Poc } from "../types";
import { CharacterFsm } from "./character-fsm/character.fsm";
import { CharacterInput } from "./character.input";
import { CharacterHud } from "./character.hud";
import { character_builder, scene_builder } from "./utils/utils";
import { buildStandAloneStrategy, type StandAloneStrategyResult } from "./strategies/stand-alone/stand-alone.strategy";
import { buildJetpackStrategy, type JetpackStrategyResult } from "./strategies/jetpack/jetpack.strategy";
import type { IVehicleStrategy } from "./strategies/contracts/ivehicle-strategy";

const JUMP_IMPULSE_FRAME = 30;

export default class CharacterBase implements Poc {
  private scene: Scene;
  private groundAggregates: PhysicsAggregate[];

  private characterMesh: Mesh;
  private characterAggregate: PhysicsAggregate;
  private characterAnimations: ICharacterAnimations | null;

  private input: CharacterInput;
  private fsm: CharacterFsm;
  private hud: CharacterHud;

  private activeStrategy: IVehicleStrategy | null = null;
  private activeJetpackPhysics: JetpackStrategyResult["physicsController"] | null = null;
  private activeStandAlonePhysics: StandAloneStrategyResult["physicsController"] | null = null;

  private beforePhysicsObserver: Nullable<Observer<Scene>> = null;
  private afterPhysicsObserver: Nullable<Observer<Scene>> = null;

  async build(scene: Scene): Promise<void> {
    this.scene = scene;
    this.groundAggregates = scene_builder(scene);

    const { characterMesh, characterAggregate, characterAnimations } = character_builder(scene);
    this.characterMesh = characterMesh;
    this.characterAggregate = characterAggregate;
    this.characterAnimations = characterAnimations;

    if (!this.characterMesh.rotationQuaternion) {
      this.characterMesh.rotationQuaternion = Quaternion.Identity();
    }

    this.input = new CharacterInput();

    this.fsm = new CharacterFsm({
      hasFuel: () => this.activeJetpackPhysics?.hasFuel() ?? true,
      onEnterEquippingJetpack: () => this._swapToJetpack(),
      onEnterStandAlone: () => this._swapToStandAlone(),
      isGroundDetected: () => this.activeStandAlonePhysics?.isGroundDetected() ?? false,
      onEnterOnAir: () => this.activeStandAlonePhysics?.applyJumpImpulse(),
      isCruiseHeld: () => this.input.current.cruise,
      isMoveHeld: () => this.input.current.forward || this.input.current.backward,
      isRunHeld: () => this.input.current.cruise,

      // ----------------------------------------------------------------
      // POC4 — bridge hacia hoverboard. Por ahora sólo console.log +
      // auto-advance a HoverBoard, para validar el pipeline end-to-end.
      // Cuando se porte la animación real, notifyBoardReady() se mueve al
      // callback de fin de animación en vez de llamarse acá directo.
      // ----------------------------------------------------------------
      onEnterEquippingBoard: () => {
        console.log("[CharacterFsm] EquippingBoard: animación puente + crear board + parenting (TODO)");
        this.fsm.notifyBoardReady();
      },

      // ----------------------------------------------------------------
      // TEMPORAL — stubs de BoardFsmDeps hasta portar board.physics.controller.ts
      // de POC2. No representan comportamiento real todavía.
      // ----------------------------------------------------------------
      groundLostElapsed: () => 0,
      coyoteTime: 0.2,
      onEnterHovering: () => { },
      onEnterFalling: () => { },
      isJumpSettled: () => true,
      onEnterJumping: () => { },
      getForwardSpeed: () => 0,
      isForwardHeld: () => this.input.current.forward,
      isPitchDownHeld: () => this.input.current.backward,
      isBoostSettled: () => true,
      onEnterDiving: () => { },
      onEnterGliderBoost: () => { },
    });

    this._wireJumpAnimationEvent();

    const { strategy, physicsController } = await buildStandAloneStrategy(
      this.scene,
      this.characterAggregate,
      this.input,
      this.fsm,
      this.characterAnimations,
    );
    this.activeStrategy = strategy;
    this.activeStandAlonePhysics = physicsController;

    this.hud = new CharacterHud(this.fsm);
    this.hud.mount();

    this._bindObservables();
  }

  private _wireJumpAnimationEvent(): void {
    const jumpAnimation = this.characterAnimations?.jump.targetedAnimations[0]?.animation;
    if (!jumpAnimation) return;

    jumpAnimation.addEvent(
      new AnimationEvent(JUMP_IMPULSE_FRAME, () => {
        this.fsm.standAloneSubFsm.notifyJumpImpulseFrame();
      }, false),
    );
  }

  private _bindObservables(): void {
    this.beforePhysicsObserver = this.scene.onBeforePhysicsObservable.add(() => {
      const dt = this.scene.getEngine().getDeltaTime() / 1000;
      this.activeStrategy?.tick(dt);
      this.fsm.tick();
    });

    this.afterPhysicsObserver = this.scene.onAfterPhysicsObservable.add(() => {
      this.activeJetpackPhysics?.applyVisualRoll();
    });
  }

  private async _swapToJetpack(): Promise<void> {
    this.activeStandAlonePhysics = null;
    this.activeStrategy?.dispose();

    const { strategy, physicsController } = await buildJetpackStrategy(
      this.characterAggregate,
      this.input,
      this.fsm,
      this.characterAnimations,
    );
    this.activeStrategy = strategy;
    this.activeJetpackPhysics = physicsController;

    this.fsm.notifyJetpackReady();
  }

  private async _swapToStandAlone(): Promise<void> {
    this.activeJetpackPhysics = null;
    this.activeStrategy?.dispose();

    const { strategy, physicsController } = await buildStandAloneStrategy(
      this.scene,
      this.characterAggregate,
      this.input,
      this.fsm,
      this.characterAnimations,
    );
    this.activeStrategy = strategy;
    this.activeStandAlonePhysics = physicsController;
  }

  dispose(): void {
    this.scene?.onBeforePhysicsObservable.remove(this.beforePhysicsObserver);
    this.scene?.onAfterPhysicsObservable.remove(this.afterPhysicsObserver);
    this.hud?.dispose();
    this.activeStrategy?.dispose();
    this.fsm?.dispose();
    this.input?.dispose();
    this.characterAggregate?.dispose();
    if (this.characterAnimations) {
      Object.values(this.characterAnimations).forEach((ag) => ag.dispose());
    }
    this.groundAggregates?.forEach((g) => g.dispose());
  }
}
