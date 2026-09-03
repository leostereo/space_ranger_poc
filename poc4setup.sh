#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------------
# Ajustá esto si el repo usa otros nombres de carpeta.
# Correr desde la raíz del repo (bp900), no desde src/.
# ------------------------------------------------------------------
POC_ROOT="src/poc"
POC3_DIR="$POC_ROOT/poc3-jetpack_character_fsm"
POC2_DIR="$POC_ROOT/poc2-floating_board_fsm"
# POC4 no se renombra: se usa la carpeta tal como ya existe (con el espacio en el nombre).
POC4_DIR="$POC_ROOT/poc3-jetpack_character_fsm copy"

if [ ! -d "$POC3_DIR" ]; then
  echo "No encuentro $POC3_DIR. Corré este script desde la raíz del repo (bp900), no desde src/." >&2
  exit 1
fi

if [ ! -d "$POC4_DIR" ]; then
  echo "No encuentro '$POC4_DIR'. Ajustá POC4_DIR en el script si el nombre real es otro." >&2
  exit 1
fi

echo "==> Portando BoardFsm de POC2 -> $POC4_DIR/character-fsm/board-fsm/"
mkdir -p "$POC4_DIR/character-fsm/board-fsm"
cp "$POC2_DIR/board-fsm/board.fsm.ts" "$POC4_DIR/character-fsm/board-fsm/board.fsm.ts"
cp "$POC2_DIR/board-fsm/board.fsm.hovering.ts" "$POC4_DIR/character-fsm/board-fsm/board.fsm.hovering.ts"
cp "$POC2_DIR/board-fsm/board.fsm.falling.ts" "$POC4_DIR/character-fsm/board-fsm/board.fsm.falling.ts"

# ------------------------------------------------------------------
# character.fsm.stand-alone.on-ground.ts (nuevo)
# ------------------------------------------------------------------
echo "==> Creando character.fsm.stand-alone.on-ground.ts"
cat > "$POC4_DIR/character-fsm/character.fsm.stand-alone.on-ground.ts" <<'EOF'
import { BaseFsm, TransitionTable } from "../abstract/base-fsm";

/**
 * Sub-FSM de OnGround: Idle <-> Walking <-> Running.
 * A diferencia de JumpImpulseStart (edge-triggered vía requestJump()), estas transiciones
 * son level-triggered por input sostenido — mismo criterio que Jetpack Cruising (isCruiseHeld).
 */
export type OnGroundSubState = "Idle" | "Walking" | "Running";

export interface OnGroundFsmDeps {
  /** true mientras W o S está presionado */
  isMoveHeld: () => boolean;
  /** true mientras Shift está presionado */
  isRunHeld: () => boolean;
}

export class OnGroundFsm extends BaseFsm<OnGroundSubState> {
  protected transitions: TransitionTable<OnGroundSubState>;

  constructor(private deps: OnGroundFsmDeps) {
    super();
    this.state = "Idle"; // estado inicial: asignado directo, no vía setState

    this.transitions = {
      Idle: {
        Walking: () => this.deps.isMoveHeld(),
      },
      Walking: {
        Idle: () => !this.deps.isMoveHeld(),
        Running: () => this.deps.isMoveHeld() && this.deps.isRunHeld(),
      },
      Running: {
        // Sin W/S, Running no puede sostenerse aunque Shift siga presionado
        Idle: () => !this.deps.isMoveHeld(),
        Walking: () => this.deps.isMoveHeld() && !this.deps.isRunHeld(),
      },
    };
  }

  protected onEnter(_state: OnGroundSubState): void {}
  protected onExit(_state: OnGroundSubState): void {}
  dispose(): void {}
}
EOF

# ------------------------------------------------------------------
# character.fsm.stand-alone.ts (reescrito, anida OnGroundFsm)
# ------------------------------------------------------------------
echo "==> Reescribiendo character.fsm.stand-alone.ts"
cat > "$POC4_DIR/character-fsm/character.fsm.stand-alone.ts" <<'EOF'
import { BaseFsm, TransitionTable } from "../abstract/base-fsm";
import { OnGroundFsm, type OnGroundSubState } from "./character.fsm.stand-alone.on-ground";

/**
 * A — A pie. `OnLadder` (roadmap original) queda para más adelante.
 * OnGround ahora es un sub-FSM propio (Idle/Walking/Running) en vez de un estado flat —
 * ver character.fsm.stand-alone.on-ground.ts.
 * Salto: OnGround -> JumpImpulseStart -> OnAir -> OnGround, mismo patrón puente que
 * BoardFsmHovering (JumpImpulseStart -> Jumping) en poc2 — el estado puente nunca se
 * auto-dispara en tick(), sólo sale vía notifyJumpImpulseFrame(), llamado por quien
 * reproduce la animación de salto al llegar al frame de impulso.
 */
export type StandAloneSubState = "OnGround" | "JumpImpulseStart" | "OnAir";

export interface StandAloneFsmDeps {
  /** Vía raycast en el physics controller activo — ver stand-alone.physics.controller.ts. */
  isGroundDetected: () => boolean;
  /** Aplica el impulso físico del salto. Se dispara al ENTRAR a OnAir (frame de impulso), no al presionar la tecla. */
  onEnterOnAir: () => void;
  /** Threading hacia OnGroundFsmDeps, mismo criterio que isGroundDetected/onEnterOnAir. */
  isMoveHeld: () => boolean;
  isRunHeld: () => boolean;
}

export class StandAloneFsm extends BaseFsm<StandAloneSubState> {
  protected transitions: TransitionTable<StandAloneSubState>;

  readonly onGroundSubFsm: OnGroundFsm;

  constructor(private deps: StandAloneFsmDeps) {
    super();
    this.state = "OnGround"; // estado inicial: asignado directo, no vía setState

    this.onGroundSubFsm = new OnGroundFsm({
      isMoveHeld: this.deps.isMoveHeld,
      isRunHeld: this.deps.isRunHeld,
    });

    this.transitions = {
      OnGround: {
        JumpImpulseStart: true, // vía requestJump()
      },
      JumpImpulseStart: {
        OnAir: true, // vía notifyJumpImpulseFrame(), manual — nunca automático en tick()
      },
      OnAir: {
        OnGround: () => this.deps.isGroundDetected(), // guard automático, mismo criterio que ground detection en poc2
      },
    };
  }

  /** Le da cuerda al sub-FSM de OnGround mientras ese sea el estado activo. */
  public override tick(): void {
    super.tick();
    if (this.state === "OnGround") {
      this.onGroundSubFsm.tick();
    }
  }

  /** Único punto de entrada de input — mismo patrón que requestJump() en BoardFsm. */
  requestJump(): void {
    if (this.state === "OnGround") {
      this.setState("JumpImpulseStart");
    }
  }

  /** Llamado por quien reproduce la animación de salto al llegar al frame de impulso (ver character.base.ts). */
  notifyJumpImpulseFrame(): void {
    if (this.state === "JumpImpulseStart") {
      this.setState("OnAir");
    }
  }

  /** Para el HUD/CharacterFsm: expone el sub-estado real de OnGround en vez del flat "OnGround". */
  getActiveSubState(): OnGroundSubState | "JumpImpulseStart" | "OnAir" {
    return this.state === "OnGround" ? this.onGroundSubFsm.getState() : this.state;
  }

  protected onEnter(state: StandAloneSubState): void {
    if (state === "OnAir") this.deps.onEnterOnAir();
  }

  protected onExit(_state: StandAloneSubState): void {}

  dispose(): void {
    this.onGroundSubFsm.dispose();
  }
}
EOF

# ------------------------------------------------------------------
# character.fsm.ts (reescrito, agrega EquippingBoard/HoverBoard + requestEquipment())
# ------------------------------------------------------------------
echo "==> Reescribiendo character.fsm.ts"
cat > "$POC4_DIR/character-fsm/character.fsm.ts" <<'EOF'
import { BaseFsm, TransitionTable } from "../abstract/base-fsm";
import { StandAloneFsm, type StandAloneSubState } from "./character.fsm.stand-alone";
import { JetpackFsm, type JetpackSubState } from "./character.fsm.jetpack";
import { BoardFsm } from "./board-fsm/board.fsm";

export type CharacterMainState =
  | "StandAlone"
  | "EquippingJetpack"
  | "Jetpack"
  | "EquippingBoard"
  | "HoverBoard";

export interface CharacterFsmDeps {
  hasFuel: () => boolean;
  onEnterEquippingJetpack: () => void;
  onEnterStandAlone: () => void;
  isGroundDetected: () => boolean;
  onEnterOnAir: () => void;
  /** Threading hacia JetpackFsmDeps, mismo criterio que isGroundDetected/onEnterOnAir hacia StandAloneFsmDeps. */
  isCruiseHeld: () => boolean;
  /** Threading hacia OnGroundFsmDeps, mismo criterio que el resto. */
  isMoveHeld: () => boolean;
  isRunHeld: () => boolean;
  /** Se dispara al ENTRAR a EquippingBoard: por ahora, sólo console.log + auto-advance (ver character.base.ts). */
  onEnterEquippingBoard: () => void;

  // --------------------------------------------------------------
  // Threading hacia BoardFsmDeps. TEMPORAL: stubbeados en character.base.ts
  // hasta que se porte la física real del board (board.physics.controller.ts)
  // desde POC2. No representan comportamiento real todavía.
  // --------------------------------------------------------------
  groundLostElapsed: () => number;
  coyoteTime: number;
  onEnterHovering: () => void;
  onEnterFalling: () => void;
  isJumpSettled: () => boolean;
  onEnterJumping: () => void;
  getForwardSpeed: () => number;
  isForwardHeld: () => boolean;
  isPitchDownHeld: () => boolean;
  isBoostSettled: () => boolean;
  onEnterDiving: () => void;
  onEnterGliderBoost: () => void;
}

export class CharacterFsm extends BaseFsm<CharacterMainState> {
  protected transitions: TransitionTable<CharacterMainState>;

  readonly standAloneSubFsm: StandAloneFsm;
  readonly jetpackSubFsm: JetpackFsm;
  readonly boardSubFsm: BoardFsm;

  private unequipRequested = false;

  constructor(private deps: CharacterFsmDeps) {
    super();
    this.state = "StandAlone";

    this.standAloneSubFsm = new StandAloneFsm({
      isGroundDetected: this.deps.isGroundDetected,
      onEnterOnAir: this.deps.onEnterOnAir,
      isMoveHeld: this.deps.isMoveHeld,
      isRunHeld: this.deps.isRunHeld,
    });
    this.jetpackSubFsm = new JetpackFsm({
      isCruiseHeld: this.deps.isCruiseHeld,
    });
    this.boardSubFsm = new BoardFsm({
      isGroundDetected: this.deps.isGroundDetected,
      groundLostElapsed: this.deps.groundLostElapsed,
      coyoteTime: this.deps.coyoteTime,
      onEnterHovering: this.deps.onEnterHovering,
      onEnterFalling: this.deps.onEnterFalling,
      isJumpSettled: this.deps.isJumpSettled,
      onEnterJumping: this.deps.onEnterJumping,
      getForwardSpeed: this.deps.getForwardSpeed,
      isForwardHeld: this.deps.isForwardHeld,
      isPitchDownHeld: this.deps.isPitchDownHeld,
      isBoostSettled: this.deps.isBoostSettled,
      onEnterDiving: this.deps.onEnterDiving,
      onEnterGliderBoost: this.deps.onEnterGliderBoost,
    });

    this.transitions = {
      StandAlone: {
        EquippingJetpack: true,
        EquippingBoard: true,
      },
      EquippingJetpack: {
        Jetpack: true,
      },
      Jetpack: {
        StandAlone: () => !this.deps.hasFuel() || this.unequipRequested,
      },
      EquippingBoard: {
        HoverBoard: true, // vía notifyBoardReady(), manual — mismo patrón que notifyJetpackReady()
      },
      HoverBoard: {
        // placeholder: sin salida todavía, se define junto con el strategy real de hoverboard
      },
    };
  }

  public override tick(): void {
    super.tick();

    if (this.state === "StandAlone") {
      this.standAloneSubFsm.tick();
    } else if (this.state === "Jetpack") {
      this.jetpackSubFsm.tick();
    } else if (this.state === "HoverBoard") {
      this.boardSubFsm.tick();
    }
  }

  /**
   * Único punto de entrada para el input de "equipar" (Ctrl). Decide internamente si
   * corresponde equipar jetpack, board, o ninguno — el input controller no sabe nada
   * de esta lógica, sólo pide "equipment" en general.
   */
  requestEquipment(): void {
    if (this.state !== "StandAlone") return;

    if (this.standAloneSubFsm.getState() === "OnAir") {
      this.setState("EquippingJetpack");
      return;
    }

    if (
      this.standAloneSubFsm.getState() === "OnGround" &&
      this.standAloneSubFsm.onGroundSubFsm.getState() === "Running"
    ) {
      this.setState("EquippingBoard");
      return;
    }
    // ni OnAir ni OnGround+Running: no pasa nada
  }

  notifyJetpackReady(): void {
    if (this.state === "EquippingJetpack") {
      this.setState("Jetpack");
    }
  }

  /** Llamado al terminar la animación puente + crear el board + hacer el parenting. */
  notifyBoardReady(): void {
    if (this.state === "EquippingBoard") {
      this.setState("HoverBoard");
    }
  }

  requestUnequipJetpack(): void {
    if (this.state === "Jetpack") {
      this.unequipRequested = true;
    }
  }

  getActiveSubState(): StandAloneSubState | JetpackSubState | "Loading" {
    if (this.state === "StandAlone") return this.standAloneSubFsm.getState();
    if (this.state === "Jetpack") return this.jetpackSubFsm.getState();
    return "Loading";
  }

  protected onEnter(state: CharacterMainState): void {
    if (state === "EquippingJetpack") this.deps.onEnterEquippingJetpack();
    if (state === "EquippingBoard") this.deps.onEnterEquippingBoard();
    if (state === "StandAlone") {
      this.deps.onEnterStandAlone();
      this.unequipRequested = false;
    }
  }

  protected onExit(_state: CharacterMainState): void {}

  dispose(): void {
    this.standAloneSubFsm.dispose();
    this.jetpackSubFsm.dispose();
    this.boardSubFsm.dispose();
  }
}
EOF

# ------------------------------------------------------------------
# character.input.ts (reescrito, equipRequested genérico en vez de equipJetpackRequested)
# ------------------------------------------------------------------
echo "==> Reescribiendo character.input.ts"
cat > "$POC4_DIR/character.input.ts" <<'EOF'
export interface CharacterInputState {
  forward: boolean;  // W
  backward: boolean; // S
  left: boolean;     // A
  right: boolean;    // D
  up: boolean;       // Space (empuje del jetpack mientras está equipado)
  cruise: boolean;   // Shift — mantenido en Jetpack/On dispara Cruising, al soltar vuelve a On
}

export class CharacterInput {
  private state: CharacterInputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    cruise: false,
  };

  /**
   * Único flag para Ctrl: no distingue jetpack/board, eso lo decide
   * CharacterFsm.requestEquipment() según el sub-estado activo.
   */
  private equipRequested = false;
  private jumpRequested = false;

  constructor() {
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
  }

  get current(): CharacterInputState {
    return this.state;
  }

  consumeEquipRequest(): boolean {
    if (!this.equipRequested) return false;
    this.equipRequested = false;
    return true;
  }

  consumeJumpRequest(): boolean {
    if (!this.jumpRequested) return false;
    this.jumpRequested = false;
    return true;
  }

  dispose(): void {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
  }

  private _onKeyDown = (ev: KeyboardEvent): void => {
    switch (ev.code) {
      case "KeyW": this.state.forward = true; break;
      case "KeyS": this.state.backward = true; break;
      case "KeyA": this.state.left = true; break;
      case "KeyD": this.state.right = true; break;
      case "Space": this.state.up = true; this.jumpRequested = true; break;
      case "ShiftLeft":
      case "ShiftRight":
        this.state.cruise = true;
        break;
      case "ControlLeft":
      case "ControlRight":
        this.equipRequested = true;
        break;
    }
  };

  private _onKeyUp = (ev: KeyboardEvent): void => {
    switch (ev.code) {
      case "KeyW": this.state.forward = false; break;
      case "KeyS": this.state.backward = false; break;
      case "KeyA": this.state.left = false; break;
      case "KeyD": this.state.right = false; break;
      case "Space": this.state.up = false; break;
      case "ShiftLeft":
      case "ShiftRight":
        this.state.cruise = false;
        break;
    }
  };
}
EOF

# ------------------------------------------------------------------
# stand-alone.input.controller.ts (reescrito, llama requestEquipment())
# ------------------------------------------------------------------
echo "==> Reescribiendo stand-alone.input.controller.ts"
cat > "$POC4_DIR/strategies/stand-alone/stand-alone.input.controller.ts" <<'EOF'
import type { IInputController } from "../contracts/iinput-controller";
import type { CharacterFsm } from "../../character-fsm/character.fsm";
import type { CharacterInput } from "../../character.input";

/**
 * Traduce input crudo -> acción de fsm para el estado StandAlone. El movimiento (WASD) lo
 * lee directo el physics controller — acá sólo se traduce lo que dispara una TRANSICIÓN.
 */
export class StandAloneInputController implements IInputController {
  constructor(
    private input: CharacterInput,
    private characterFsm: CharacterFsm,
  ) {}

  tick(): void {
    if (this.input.consumeEquipRequest()) {
      this.characterFsm.requestEquipment();
    }
    if (this.input.consumeJumpRequest()) {
      this.characterFsm.standAloneSubFsm.requestJump();
    }
  }

  dispose(): void {}
}
EOF

# ------------------------------------------------------------------
# character.base.ts (reescrito, agrega deps de board + onEnterEquippingBoard stub)
# ------------------------------------------------------------------
echo "==> Reescribiendo character.base.ts"
cat > "$POC4_DIR/character.base.ts" <<'EOF'
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
      onEnterHovering: () => {},
      onEnterFalling: () => {},
      isJumpSettled: () => true,
      onEnterJumping: () => {},
      getForwardSpeed: () => 0,
      isForwardHeld: () => this.input.current.forward,
      isPitchDownHeld: () => this.input.current.backward,
      isBoostSettled: () => true,
      onEnterDiving: () => {},
      onEnterGliderBoost: () => {},
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
EOF

echo ""
echo "==> Listo. POC4 creado en $POC4_DIR"
echo ""
echo "Pendiente manual:"
echo "  - Revisar los imports de board.fsm.ts en $POC4_DIR/character-fsm/board-fsm/"
echo "    (puede que referencien '../abstract/base-fsm' con una profundidad de carpeta"
echo "    distinta a la de POC2 — ajustar el import relativo si TS se queja)."
echo "  - Registrar POC4 en el selector de POCs (App / registry), si corresponde."
echo "  - Los deps de BoardFsm en character.base.ts son stubs temporales: no hay"
echo "    física real de board todavía en POC4."