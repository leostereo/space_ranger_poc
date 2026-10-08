import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Nullable } from "@babylonjs/core/types";
import { Quaternion, type Vector3 } from "@babylonjs/core/Maths/math.vector";
import { AnimationEvent, AnimationGroup, FollowCamera, PhysicsShapeType, TransformNode } from "@babylonjs/core";
import type { CharacterAnimationSet } from "@/game/assets/animations/character-clip-names";
import type { AssetRegistry } from "@/game/assets/asset-registry";

import { EventSubscriber } from "@/game/services/event-subscriber";
import { EventManager, GameEvents, type PlayerShootedPayload } from "@/game/services/event-manager";


import { CharacterFsm } from "./character-fsm/character.fsm";
import { CharacterInput } from "./character.input";
import { CharacterHud } from "./character.hud";
import { CharacterHealth } from "./character-health";
import { buildStandAloneStrategy, type StandAloneStrategyResult } from "./strategies/stand-alone/stand-alone.strategy";
import { buildJetpackStrategy, type JetpackStrategyResult } from "./strategies/jetpack/jetpack.strategy";
import type { IVehicleStrategy } from "./strategies/contracts/ivehicle-strategy";
import { board_builder } from "./strategies/hover-board/board.builder";
import { CHARACTER_CAPSULE_HEIGHT, CHARACTER_MASS } from "./character.constants";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { HoverBoardPhysicsController } from "./strategies/hover-board/hover-board.physics.controller";
import { HoverBoardInputAdapter } from "./strategies/hover-board/hover-board.input.adapter";
import { buildHoverBoardStrategy } from "./strategies/hover-board/hover-board.strategy";
import { characterAndEquipment_builder } from "./utils/buildUtils";
import { CombatRules } from "./utils/combat-rules";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Material } from "@babylonjs/core/Materials/material";

const BOARD_GROUND_COYOTE_TIME_SECONDS = 0.15; // tolerancia antes de considerar que el board perdió el suelo
const JUMP_IMPULSE_FRAME = 30; const EQUIP_BOARD_FRAME = 60; // placeholder — ajustar cuando definan el frame real del clip
const WEAPON_HOVERBOARD_YAW_COMPENSATION = Math.PI / 8; // cancela characterMesh.rotation.y = -PI/8 en HoverBoard
const RUNNING_JUMP_IMPULSE_FRAME = 10; // placeholder — ajustar al frame real del clip
const CROUCH_ROLL_COMPLETE_FRAME = 85; // placeholder — ajustar al frame real del clip running_roll

// NUEVO — posición del personaje parentado al board: una sola fuente de verdad para montarse y para morir.
const BOARD_RIDER_OFFSET_X = 0.05;
const BOARD_RIDER_OFFSET_Z = -0.25;
const BOARD_THICKNESS_OFFSET = 0.05;
/**
 * Fracción de la altura de la cápsula que se baja el cuerpo al morir sobre el board.
 * 0 = misma altura que montado; 0.5 = el origen del personaje queda sobre la superficie del board.
 * Es la única perilla a ajustar: si queda hundido, bajarla; si sigue flotando, subirla.
 */
const DEATH_ON_BOARD_DROP_FACTOR = 0.1;

export const WEAPON_OFFSETS = {
  jetpack: { x: -0.1, y: 0.16, z: 0 },
  standAlone: { x: -0.08, y: 0.2, z: 0 },
  hoverBoard: { x: -0.15, y: -0.05, z: 0 },
  crouchIdle: { x: -0.08, y: -0.06, z: 0 },
  strafe_right: { x: -0.08, y: 0.08, z: 0.2 },
  strafe_left: { x: -0.12, y: 0.08, z: 0.2 },
  crouchWalking: { x: -0.08, y: 0, z: 0 },
  crouchWalkingBackwards: { x: -0.08, y: 0, z: 0 },
} as const;

  const SHIELD_HOVERBOARD_OFFSET = { x: -0.05, y: -0.1, z: 0.45 } as const;
  
  export const SHIELD_OFFSETS = {
    idle: { x: -0.1, y: 0.1, z: 0.3 },
    walking: { x: 0, y: 0.1, z: 0.3 },
    walkingBackwards: { x: 0, y: 0.1, z: 0.3 },
    strafe_left: { x: -0.1, y: 0.1, z: 0.3 },
    strafe_right: { x: -0.1, y: 0.1, z: 0.3 },
    crouchIdle: { x: -0.1, y: -0.1, z: 0.3 },
} as const;

export default class CharacterBase extends EventSubscriber {
  private scene: Scene;
  //private groundAggregates: PhysicsAggregate[];
  private followCamera: FollowCamera | null = null;
  private characterMesh: Mesh;
  private characterAggregate: PhysicsAggregate;
  private characterAnimations: CharacterAnimationSet;

  private input: CharacterInput;
  private fsm: CharacterFsm;
  private hud: CharacterHud;
  private health = new CharacterHealth(); // NUEVO

  private activeStrategy: IVehicleStrategy | null = null;
  private activeJetpackPhysics: JetpackStrategyResult["physicsController"] | null = null;
  private activeStandAlonePhysics: StandAloneStrategyResult["physicsController"] | null = null;

  private beforePhysicsObserver: Nullable<Observer<Scene>> = null;
  private afterPhysicsObserver: Nullable<Observer<Scene>> = null;

  private _activeBoardMesh: Mesh | null = null;
  private _activeBoardAggregate: PhysicsAggregate | null = null;

  private activeBoardPhysics: HoverBoardPhysicsController | null = null;
  private _activeBoardInputAdapter: HoverBoardInputAdapter | null = null;
  
  private weaponRoot: TransformNode | null = null;
  private weaponMuzzle: TransformNode | null = null;

  private thrusterGroup: TransformNode | null = null;
  private thrusterLeft: Mesh | null = null;
  private thrusterRight: Mesh | null = null;
  private thrusterLeftNozzle: TransformNode | null = null;
  private thrusterRightNozzle: TransformNode | null = null;

  private combat: CombatRules;
  private shieldRoot: TransformNode | null = null;
  private disposeEquipment: (() => void) | null = null;
  private flareTexture: Texture;
  private boardMaterial: Material;

  /** Construye el Character listo para jugar. Quien lo crea lo registra en el LevelScope (`scope.register`). */
  static async create(scene: Scene, registry: AssetRegistry, spawn: Vector3): Promise<CharacterBase> {
    const character = new CharacterBase();
    await character.initialize(scene, registry, spawn);
    return character;
  }

  private async initialize(scene: Scene, registry: AssetRegistry, spawn: Vector3): Promise<void> {
    this.scene = scene;

    const { characterMesh, characterAggregate, characterAnimations, weaponRoot, muzzle,
      thrusterGroup, thrusterLeft, thrusterRight, thrusterLeftNozzle, thrusterRightNozzle, shieldRoot,
      dispose: disposeEquipment } = characterAndEquipment_builder(scene, registry, spawn);
    this.characterMesh = characterMesh;
    this.characterAggregate = characterAggregate;
    this.characterAnimations = characterAnimations;
    this.disposeEquipment = disposeEquipment;
    this.flareTexture = registry.getTexture("flare");
    this.boardMaterial = registry.getMaterial("board");
    this.weaponRoot = weaponRoot;
    this.weaponMuzzle = muzzle;
    this.thrusterGroup = thrusterGroup;
    this.thrusterLeft = thrusterLeft;
    this.thrusterRight = thrusterRight;
    this.thrusterLeftNozzle = thrusterLeftNozzle;
    this.thrusterRightNozzle = thrusterRightNozzle;
    weaponRoot.parent = this.characterMesh;
    this._applyWeaponOffset(WEAPON_OFFSETS.standAlone);
    this.shieldRoot = shieldRoot;

    if (!this.characterMesh.rotationQuaternion) {
      this.characterMesh.rotationQuaternion = Quaternion.Identity();
    }

    // TODO: la cámara de seguimiento se define aparte; mientras tanto followCamera queda en null.
    this.input = new CharacterInput();

    this.fsm = new CharacterFsm({
      hasFuel: () => this.activeJetpackPhysics?.hasFuel() ?? true,
      onEnterEquippingJetpack: () => this._swapToJetpack(),
      onEnterStandAlone: () => queueMicrotask(() => this._swapToStandAlone()),
      isGroundDetected: () => this.activeStandAlonePhysics?.isGroundDetected() ?? false,
      onEnterOnAir: () => this.activeStandAlonePhysics?.applyJumpImpulse(),
      isCruiseHeld: () => this.input.current.cruise,
      isShootHeld: () => this.input.current.shoot,
      onEnterShooting: () => this.activeJetpackPhysics?.notifyShootingEnter(),
      onExitShooting: () => this.activeJetpackPhysics?.notifyShootingExit(),
      isStandAloneForwardHeld: () => this.input.current.forward,
      isStandAloneBackwardHeld: () => this.input.current.backward,
      isRunHeld: () => this.input.current.cruise,
      isLeftHeld: () => this.input.current.left,
      isRightHeld: () => this.input.current.right,
      isAimingHeld: () => this.combat.isAiming(),
      isShieldHeld: () => this.combat.isShielding(),
      isCrouchHeld: () => this.input.current.crouch,
      onEnterHoverBoard: () => this._swapToHoverBoard(),
      getVerticalSpeed: () => this.activeStandAlonePhysics?.getLastImpactVerticalSpeed() ?? 0,
      getHorizontalSpeed: () => this.activeStandAlonePhysics?.getLastImpactHorizontalSpeed() ?? 0,
      onEnterLandingRoll: () => this.activeStandAlonePhysics?.notifyLandingRollStart(),
      onExitLandingRoll: () => this.activeStandAlonePhysics?.notifyLandingRollEnd(),
      onEnterJumpWindup: () => this.activeStandAlonePhysics?.notifyJumpWindupStart(),
      onExitJumpWindup: () => this.activeStandAlonePhysics?.notifyJumpWindupEnd(),
      isBoardGroundDetected: () => this.activeBoardPhysics?.isGroundDetected() ?? false,
      groundLostElapsed: () => this.activeBoardPhysics?.groundLostElapsed() ?? 0,
      coyoteTime: BOARD_GROUND_COYOTE_TIME_SECONDS,
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
      onEnterRunningJumpOnAir: () => this.activeStandAlonePhysics?.applyRunningJumpImpulse(),
      weaponRoot,
      shieldRoot,
      onEnterCrouch: () => this.activeStandAlonePhysics?.notifyCrouchEnter(), // NUEVO
      onExitCrouch: () => this.activeStandAlonePhysics?.notifyCrouchExit(),  // NUEVO
      onEnterCrouchRoll: () => this.activeStandAlonePhysics?.notifyCrouchRollStart(), // NUEVO
      onExitCrouchRoll: () => this.activeStandAlonePhysics?.notifyCrouchRollEnd(),
      onEnterHitStun: () => this.activeStandAlonePhysics?.notifyHitStunStart(), // NUEVO
      onExitHitStun: () => this.activeStandAlonePhysics?.notifyHitStunEnd(),    // NUEVO
      onEnterDead: () => this._onEnterDead(),                                    // NUEVO
    });

    this.combat = new CombatRules(this.fsm, this.input);
    this.subscribeEvents();

    this._wireJumpAnimationEvent();
    this._wireEquipBoardAnimationEvent();
    this._wireLandingAnimationEvents();
    this._wireRunningJumpAnimationEvent();
    this._wireCrouchRollAnimationEvent();

    const { strategy, physicsController } = await buildStandAloneStrategy(
      this.scene,
      this.characterAggregate,
      this.input,
      this.fsm,
      this.characterAnimations,
      this.weaponMuzzle,
      this.combat,
    );

    this.activeStrategy = strategy;
    this.activeStandAlonePhysics = physicsController;

    this.hud = new CharacterHud(this.fsm);
    this.hud.mount();

    this._bindObservables();
  }

  protected registerEvents(): void {
    this.listen(GameEvents.PlayerShooted, (payload) => this._onPlayerShooted(payload));
  }

  private _onPlayerShooted(_payload: PlayerShootedPayload): void {
    // Estados sin reacción implementada (jetpack, onAir, landings, rolls, hoverboard por ahora): intocable.
    if (!this.fsm.canReceiveHit()) return;

    const alive = this.health.loseLife();
    EventManager.emit(GameEvents.PlayerDamaged, { livesLeft: this.health.lives });

    if (alive) {
      this.fsm.notifyHit();
    } else {
      this.fsm.notifyDeath();
      EventManager.emit(GameEvents.PlayerDied, {});
    }
  }

  private _onEnterDead(): void {
    this.activeStandAlonePhysics?.notifyDead(() => this.fsm.standAloneSubFsm.notifyDeadLanding());
    this.activeBoardPhysics?.notifyDead();

    // NUEVO — jetpack: corta empuje y sustentación (cae por gravedad) y apaga los thrusters visuales.
    if (this.activeJetpackPhysics) {
      this.activeJetpackPhysics.notifyDead(() => this.fsm.jetpackSubFsm.notifyDeadLanding());
      this._setThrustersEnabled(false);
    }

    // NUEVO — sobre el board, el personaje queda parentado a una altura pensada para ir de pie/agachado;
    // el clip de muerte lo deja flotando, así que lo bajamos con la misma fórmula del montaje
    // (el board ya cae solo por física).
    if (this._activeBoardMesh) {
      this.characterMesh.position.y = this._boardRiderY(true);
    }

    this.weaponRoot?.setEnabled(false);
    this.shieldRoot?.setEnabled(false);
  }

  private _updateShield(): void {
    this.shieldRoot?.setEnabled(this.combat.isShielding());
  }

  private _updateWeaponVisibility(): void {
    this.weaponRoot?.setEnabled(this.combat.isAiming());
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

  private _wireRunningJumpAnimationEvent(): void {
    const runningJumpAnimation = this.characterAnimations?.jump_while_running.targetedAnimations[0]?.animation;
    if (!runningJumpAnimation) return;

    runningJumpAnimation.addEvent(
      new AnimationEvent(RUNNING_JUMP_IMPULSE_FRAME, () => {
        this.fsm.standAloneSubFsm.notifyRunningJumpImpulseFrame();
      }, false),
    );
  }

  private _wireCrouchRollAnimationEvent(): void { // NUEVO
    const crouchRollAnimation = this.characterAnimations?.running_roll.targetedAnimations[0]?.animation;
    if (!crouchRollAnimation) return;

    crouchRollAnimation.addEvent(
      new AnimationEvent(CROUCH_ROLL_COMPLETE_FRAME, () => {
        this.fsm.standAloneSubFsm.notifyCrouchRollComplete();
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

  private _wireLandingAnimationEvents(): void {
    const wireOnComplete = (group: AnimationGroup | undefined, notify_frame: number) => {
      const anim = group?.targetedAnimations[0]?.animation;
      if (!anim) return;

      anim.addEvent(
        new AnimationEvent(notify_frame, () => {
          this.fsm.standAloneSubFsm.onGroundSubFsm.notifyLandingAnimationComplete();
        }, false),
      );
    };

    const NORMAL_LAST_FRAME = 60;
    const CRASH_LAST_FRAME = 96;
    const ROLL_LAST_FRAME = 90;

    wireOnComplete(this.characterAnimations?.normal_landing, NORMAL_LAST_FRAME);
    wireOnComplete(this.characterAnimations?.crash_landing, CRASH_LAST_FRAME);
    wireOnComplete(this.characterAnimations?.roll_landing, ROLL_LAST_FRAME);
  }

  private _bindObservables(): void {
    this.beforePhysicsObserver = this.scene.onBeforePhysicsObservable.add(() => {
      const dt = this.scene.getEngine().getDeltaTime() / 1000;

      // NUEVO — muerto: sin input, disparo ni animación; sólo seguimos tickeando la física para que frene
      // (en el board, además, para que siga flotando mientras se detiene).
      if (this.fsm.getState() === "Dead") {
        this.activeStandAlonePhysics?.tick(dt);
        this.activeBoardPhysics?.tick(dt);
        this.activeJetpackPhysics?.tick(dt); // NUEVO
        return;
      }

      this.activeStrategy?.tick(dt);
      this.fsm.tick();
      this._updateWeaponVisibility();
      this._updateShield();
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

    if (!this.weaponMuzzle) {
      throw new Error("_swapToJetpack: weaponMuzzle no está inicializado — revisar build().");
    }

    if (!this.thrusterGroup || !this.thrusterLeft || !this.thrusterRight || !this.thrusterLeftNozzle || !this.thrusterRightNozzle) {
      throw new Error("_swapToJetpack: thrusters no inicializados — revisar build().");
    }

    this._applyWeaponOffset(WEAPON_OFFSETS.jetpack); // NUEVO
    this._setThrustersEnabled(true); // NUEVO


    const { strategy, physicsController } = await buildJetpackStrategy(
      this.scene,
      this.characterAggregate,
      this.input,
      this.fsm,
      this.characterAnimations,
      this.weaponMuzzle,
      this.thrusterGroup,
      this.thrusterLeftNozzle, // CAMBIADO — antes thrusterLeft (mesh), ahora el nozzle
      this.thrusterRightNozzle, // CAMBIADO
      this.flareTexture,
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
      this.weaponRoot?.rotation.set(0, 0, 0);
      this.shieldRoot?.rotation.set(0, 0, 0);

      this._activeBoardAggregate.dispose();
      this._activeBoardMesh.dispose();
      this._activeBoardMesh = null;
      this._activeBoardAggregate = null;

      this.activeBoardPhysics = null;
      this._activeBoardInputAdapter = null;

      this.characterAggregate = new PhysicsAggregate(
        this.characterMesh,
        PhysicsShapeType.CAPSULE,
        { mass: CHARACTER_MASS, restitution: 0 },
        this.scene,
      );

      // NUEVO: aplicar velocidades heredadas al nuevo aggregate del personaje
      this.characterAggregate.body.setLinearVelocity(spawnLinearVelocity);
      this.characterAggregate.body.setAngularVelocity(spawnAngularVelocity);

      if (this.followCamera) {
        this.followCamera.lockedTarget = this.characterMesh;
      }
    }

    if (!this.weaponMuzzle) {
      throw new Error("_swapToStandAlone: weaponMuzzle no está inicializado — revisar build().");
    }

    this._applyWeaponOffset(WEAPON_OFFSETS.standAlone);
    this._applyShieldOffset(SHIELD_OFFSETS.idle); // NUEVO
    this._setThrustersEnabled(false); // NUEVO

    const { strategy, physicsController } = await buildStandAloneStrategy(
      this.scene,
      this.characterAggregate,
      this.input,
      this.fsm,
      this.characterAnimations,
      this.weaponMuzzle, // NUEVO
      this.combat,
      initialGroundDetectedOverride,
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
    const { boardMesh, boardAggregate } = board_builder(this.scene, this.boardMaterial, spawnPosition, spawnRotationY);
    // ELIMINADO: boardMesh.rotationQuaternion = Quaternion.FromEulerAngles(0, spawnRotationY, 0);
    // (ya no hace falta, board_builder lo aplica antes de crear el aggregate)

    boardAggregate.body.setLinearVelocity(spawnLinearVelocity);
    boardAggregate.body.setAngularVelocity(spawnAngularVelocity);

    if (this.followCamera) {
      this.followCamera.lockedTarget = boardMesh;
    }

    this.characterMesh.setParent(boardMesh);
    this.characterMesh.rotationQuaternion = null;

    this.characterMesh.position.set(BOARD_RIDER_OFFSET_X, this._boardRiderY(), BOARD_RIDER_OFFSET_Z); // CAMBIADO — offsets unificados con la muerte
    this.characterMesh.rotation.set(0, -Math.PI / 8, 0);
    this.weaponRoot?.rotation.set(0, WEAPON_HOVERBOARD_YAW_COMPENSATION, 0);
    this.shieldRoot?.rotation.set(0, WEAPON_HOVERBOARD_YAW_COMPENSATION, 0);

    this._activeBoardMesh = boardMesh;
    this._activeBoardAggregate = boardAggregate;

    if (!this.weaponMuzzle) {
      throw new Error("_swapToHoverBoard: weaponMuzzle no está inicializado — revisar build().");
    }

    this._applyWeaponOffset(WEAPON_OFFSETS.hoverBoard); // NUEVO
    this._applyShieldOffset(SHIELD_HOVERBOARD_OFFSET); // NUEVO

    const { strategy, physicsController } = await buildHoverBoardStrategy(
      this.scene,
      boardMesh,
      boardAggregate,
      this.input,
      this.fsm,
      this.characterAnimations,
      this.characterMesh,
      this.weaponMuzzle,
      this.combat, // NUEVO
      this.flareTexture,
    );

    this.activeStrategy = strategy;
    this.activeBoardPhysics = physicsController;
    this._activeBoardInputAdapter = new HoverBoardInputAdapter(this.input);
  }

  /**
   * NUEVO — altura local (Y) del personaje parentado al board. Misma fórmula que usaba el swap
   * (mitad de la cápsula + grosor del board). Con dead = true baja una fracción de la cápsula.
   */
  private _boardRiderY(dead = false): number {
    const capsuleHeight = CHARACTER_CAPSULE_HEIGHT;
    const ridingY = capsuleHeight / 2 + BOARD_THICKNESS_OFFSET;
    return dead ? ridingY - capsuleHeight * DEATH_ON_BOARD_DROP_FACTOR : ridingY;
  }

  private _applyWeaponOffset(offset: { x: number; y: number; z: number }): void {
    this.weaponRoot?.position.set(offset.x, offset.y, offset.z);
  }

  private _applyShieldOffset(offset: { x: number; y: number; z: number }): void {
    this.shieldRoot?.position.set(offset.x, offset.y, offset.z);
  }

  private _setThrustersEnabled(enabled: boolean): void {
    this.thrusterGroup?.setEnabled(enabled); // CAMBIADO — un solo toggle, cascada automática
  }

  // Helper nuevo — agregalo como método privado de la clase (cerca de _swapToStandAlone/_swapToHoverBoard)
  private _getYawFromTransformNode(node: TransformNode): number {
    if (node.rotationQuaternion) {
      return node.rotationQuaternion.toEulerAngles().y;
    }
    return node.rotation.y;
  }

  dispose(): void {
    this.unsubscribeEvents();
    this.scene?.onBeforePhysicsObservable.remove(this.beforePhysicsObserver);
    this.scene?.onAfterPhysicsObservable.remove(this.afterPhysicsObserver);
    this.hud?.dispose();
    this.activeStrategy?.dispose();
    this.fsm?.dispose();
    this.input?.dispose();
    this.characterAggregate?.dispose();
    this.disposeEquipment?.(); // personaje clonado, animaciones, arma, propulsores, escudo y cápsula
    this.disposeEquipment = null;
    this._activeBoardAggregate?.dispose();
    this._activeBoardMesh?.dispose();
    this._activeBoardAggregate = null;
    this._activeBoardMesh = null;
  }
}