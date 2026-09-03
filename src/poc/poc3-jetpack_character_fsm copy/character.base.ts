import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Nullable } from "@babylonjs/core/types";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { AnimationEvent, FollowCamera, PhysicsShapeType, TransformNode } from "@babylonjs/core";
import { AssetManager, type ICharacterAnimations } from "@/services/assets-manager";
import { Poc } from "../types";
import { CharacterFsm } from "./character-fsm/character.fsm";
import { CharacterInput } from "./character.input";
import { CharacterHud } from "./character.hud";
import { character_builder, scene_builder } from "./utils/utils";
import { buildStandAloneStrategy, type StandAloneStrategyResult } from "./strategies/stand-alone/stand-alone.strategy";
import { buildJetpackStrategy, type JetpackStrategyResult } from "./strategies/jetpack/jetpack.strategy";
import type { IVehicleStrategy } from "./strategies/contracts/ivehicle-strategy";
import { board_builder } from "./strategies/hover-board/board.builder";
import { generalConfig } from "../config.general";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { HoverBoardPhysicsController } from "./strategies/hover-board/hover-board.physics.controller";
import { HoverBoardInputAdapter } from "./strategies/hover-board/hover-board.input.adapter";
import { buildHoverBoardStrategy } from "./strategies/hover-board/hover-board.strategy";


const JUMP_IMPULSE_FRAME = 30;
const EQUIP_BOARD_FRAME = 60; // placeholder — ajustar cuando definan el frame real del clip

export default class CharacterBase implements Poc {
  private scene: Scene;
  //private groundAggregates: PhysicsAggregate[];
  private followCamera: FollowCamera | null = null;
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

  private _activeBoardMesh: Mesh | null = null;
  private _activeBoardAggregate: PhysicsAggregate | null = null;

  private activeBoardPhysics: HoverBoardPhysicsController | null = null;
  private _activeBoardInputAdapter: HoverBoardInputAdapter | null = null;

  async build(scene: Scene): Promise<void> {
    this.scene = scene;
    scene_builder(scene);

    const { characterMesh, characterAggregate, characterAnimations } = character_builder(scene);
    this.characterMesh = characterMesh;
    this.characterAggregate = characterAggregate;
    this.characterAnimations = characterAnimations;

    if (!this.characterMesh.rotationQuaternion) {
      this.characterMesh.rotationQuaternion = Quaternion.Identity();
    }

    this.followCamera = AssetManager.getCamera('follow', false, 'camera') as FollowCamera;
    this.input = new CharacterInput();

    this.fsm = new CharacterFsm({
      hasFuel: () => this.activeJetpackPhysics?.hasFuel() ?? true,
      onEnterEquippingJetpack: () => this._swapToJetpack(),
      onEnterStandAlone: () => queueMicrotask(() => this._swapToStandAlone()),
      isGroundDetected: () => this.activeStandAlonePhysics?.isGroundDetected() ?? false,
      onEnterOnAir: () => this.activeStandAlonePhysics?.applyJumpImpulse(),
      isCruiseHeld: () => this.input.current.cruise,
      isMoveHeld: () => this.input.current.forward || this.input.current.backward,
      isRunHeld: () => this.input.current.cruise,
      onEnterHoverBoard: () => this._swapToHoverBoard(),
      isBoardGroundDetected: () => this.activeBoardPhysics?.isGroundDetected() ?? false,
      groundLostElapsed: () => this.activeBoardPhysics?.groundLostElapsed() ?? 0,
      coyoteTime: generalConfig.groundCheck.coyoteTime,
      onEnterHovering: () => this.activeBoardPhysics?.onEnterHovering(),
      onEnterFalling: () => { },
      isJumpSettled: () => this.activeBoardPhysics?.isJumpSettled() ?? true,
      onEnterJumping: () => this.activeBoardPhysics?.onEnterJumping(),
      getForwardSpeed: () => this.activeBoardPhysics?.getForwardSpeed() ?? 0,
      isForwardHeld: () => this._activeBoardInputAdapter?.current.forward ?? false,
      isPitchDownHeld: () => this._activeBoardInputAdapter?.current.pitchDown ?? false,
      isBoostSettled: () => this.activeBoardPhysics?.isBoostSettled() ?? true,
      onEnterDiving: () => { },
      onEnterGliderBoost: () => this.activeBoardPhysics?.onEnterGliderBoost(),


    });

    this._wireJumpAnimationEvent();
    this._wireEquipBoardAnimationEvent();

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
        this.fsm.boardSubFsm.hoveringSubFsm.notifyJumpImpulseFrame();
      }, false),
    );
  }

  private _wireEquipBoardAnimationEvent(): void {
    const equipAnimation = this.characterAnimations?.jump_on_board.targetedAnimations[0]?.animation;
    if (!equipAnimation) return;

    equipAnimation.addEvent(
      new AnimationEvent(EQUIP_BOARD_FRAME, () => {
        this.fsm.standAloneSubFsm.onGroundSubFsm.notifyEquipAnimationFrame();
        this.fsm.notifyBoardReady();
      }, false),
    );
  }

  private _bindObservables(): void {
    this.beforePhysicsObserver = this.scene.onBeforePhysicsObservable.add(() => {
      const dt = this.scene.getEngine().getDeltaTime() / 1000;
      this.activeStrategy?.tick(dt);
      this.fsm.tick();
      if (this.fsm.getState() === "HoverBoard" && this.input.consumeEquipRequest()) {
        this.fsm.requestUnequipBoard();
      }
    });

    this.afterPhysicsObserver = this.scene.onAfterPhysicsObservable.add(() => {
      this.activeJetpackPhysics?.applyVisualRoll();
      this.activeBoardPhysics?.applyVisualRoll();
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
    this.activeStrategy = null;
    const initialGroundDetectedOverride = this.activeBoardPhysics?.isGroundDetected();

    if (this._activeBoardMesh && this._activeBoardAggregate) {
      const spawnPosition = this.characterMesh.getAbsolutePosition().clone();
      const spawnRotationY = this._getYawFromTransformNode(this._activeBoardMesh);

      // NUEVO: capturar velocidades del board ANTES de disponerlo
      const spawnLinearVelocity = this._activeBoardAggregate.body.getLinearVelocity().clone();
      const spawnAngularVelocity = this._activeBoardAggregate.body.getAngularVelocity().clone();

      this.characterMesh.setParent(null);
      this.characterMesh.position.copyFrom(spawnPosition);
      this.characterMesh.rotationQuaternion = Quaternion.FromEulerAngles(0, spawnRotationY, 0);

      this._activeBoardAggregate.dispose();
      this._activeBoardMesh.dispose();
      this._activeBoardMesh = null;
      this._activeBoardAggregate = null;

      this.activeBoardPhysics = null;
      this._activeBoardInputAdapter = null;

      this.characterAggregate = new PhysicsAggregate(
        this.characterMesh,
        PhysicsShapeType.CAPSULE,
        { mass: 70 },
        this.scene,
      );

      // NUEVO: aplicar velocidades heredadas al nuevo aggregate del personaje
      this.characterAggregate.body.setLinearVelocity(spawnLinearVelocity);
      this.characterAggregate.body.setAngularVelocity(spawnAngularVelocity);

      if (this.followCamera) {
        this.followCamera.lockedTarget = this.characterMesh;
      }
    }

    const { strategy, physicsController } = await buildStandAloneStrategy(
      this.scene,
      this.characterAggregate,
      this.input,
      this.fsm,
      this.characterAnimations,
      initialGroundDetectedOverride, // NUEVO
    );
    this.activeStrategy = strategy;
    this.activeStandAlonePhysics = physicsController;
  }

  private async _swapToHoverBoard(): Promise<void> {
    this.activeStandAlonePhysics = null;
    this.activeStrategy?.dispose();
    this.activeStrategy = null;

    const spawnPosition = this.characterAggregate.transformNode.getAbsolutePosition().clone();
    const spawnRotationY = this._getYawFromTransformNode(this.characterAggregate.transformNode);

    // NUEVO: capturar velocidades del personaje ANTES de disponer su aggregate
    const spawnLinearVelocity = this.characterAggregate.body.getLinearVelocity().clone();
    const spawnAngularVelocity = this.characterAggregate.body.getAngularVelocity().clone();

    this.characterAggregate.dispose();

    // CAMBIADO: pasamos spawnRotationY directo al builder en vez de setearlo después
    const { boardMesh, boardAggregate } = board_builder(this.scene, spawnPosition, spawnRotationY);

    // ELIMINADO: boardMesh.rotationQuaternion = Quaternion.FromEulerAngles(0, spawnRotationY, 0);
    // (ya no hace falta, board_builder lo aplica antes de crear el aggregate)

    boardAggregate.body.setLinearVelocity(spawnLinearVelocity);
    boardAggregate.body.setAngularVelocity(spawnAngularVelocity);

    if (this.followCamera) {
      this.followCamera.lockedTarget = boardMesh;
    }

    this.characterMesh.setParent(boardMesh);
    this.characterMesh.rotationQuaternion = null;

    const capsuleHeight = generalConfig.playerConfig.height;
    const offsetX_Capsule = 0.05;
    const offsetZ_Capsule = -0.25;
    const boardThicknessOffset = 0.05;
    const capsuleYOffset = capsuleHeight / 2 + boardThicknessOffset;

    this.characterMesh.position.set(offsetX_Capsule, capsuleYOffset, offsetZ_Capsule);
    this.characterMesh.rotation.set(0, -Math.PI / 8, 0);

    this._activeBoardMesh = boardMesh;
    this._activeBoardAggregate = boardAggregate;

    const { strategy, physicsController } = await buildHoverBoardStrategy(
      this.scene,
      boardMesh,
      boardAggregate,
      this.input,
      this.fsm,
      this.characterAnimations,
    );

    this.activeStrategy = strategy;
    this.activeBoardPhysics = physicsController;
    this._activeBoardInputAdapter = new HoverBoardInputAdapter(this.input);
  }

  // Helper nuevo — agregalo como método privado de la clase (cerca de _swapToStandAlone/_swapToHoverBoard)
  private _getYawFromTransformNode(node: TransformNode): number {
    if (node.rotationQuaternion) {
      return node.rotationQuaternion.toEulerAngles().y;
    }
    return node.rotation.y;
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
    // this.groundAggregates?.forEach((g) => g.dispose());
  }
}
