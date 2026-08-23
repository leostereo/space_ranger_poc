// src/poc3-jetpack_character_fsm/character.base.ts
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Nullable } from "@babylonjs/core/types";
import type { ICharacterAnimations } from "@/services/assets-manager";
import { Poc } from "../types";
import { CharacterFsm } from "./character-fsm/character.fsm";
import { CharacterInput } from "./character.input";
import { CharacterHud } from "./character.hud";
import { character_builder, scene_builder } from "./utils/utils";
import { buildStandAloneStrategy } from "./strategies/stand-alone/stand-alone.strategy";
import { buildJetpackStrategy, type JetpackStrategyResult } from "./strategies/jetpack/jetpack.strategy";
import type { IVehicleStrategy } from "./strategies/contracts/ivehicle-strategy";

/**
 * Orquestador de POC3. A diferencia de board.base.ts (poc2), acá la fsm NO vive adentro
 * de un controller — vive directo acá, porque los controllers (agrupados en
 * IVehicleStrategy) se destruyen/recrean en cada transición y la fsm tiene que sobrevivir
 * a eso. Ver poc3.md, sección "Confirmado a partir del código real de POC2".
 *
 * SUPUESTO (a confirmar, ver poc3.md "Punto abierto — carga de assets antes de build()"):
 * `AssetManager.cargarTodo(canvas, scene)` ya se llamó y resolvió ANTES de que este
 * `build(scene)` se ejecute.
 */
export default class CharacterBase implements Poc {
  private scene: Scene;
  private groundAggregates: PhysicsAggregate[];

  // Compartidos entre StandAlone y Jetpack — se construyen UNA sola vez (ver utils.ts).
  private characterMesh: Mesh;
  private characterAggregate: PhysicsAggregate;
  private characterAnimations: ICharacterAnimations | null;

  private input: CharacterInput;
  private fsm: CharacterFsm;
  private hud: CharacterHud;

  private activeStrategy: IVehicleStrategy | null = null;
  // Referencia concreta (no genérica) al physics controller de Jetpack, sólo mientras está
  // activo — es lo que le da a la fsm su dep hasFuel() sin que la fsm conozca la clase.
  private activeJetpackPhysics: JetpackStrategyResult["physicsController"] | null = null;

  private beforePhysicsObserver: Nullable<Observer<Scene>> = null;

  async build(scene: Scene): Promise<void> {
    this.scene = scene;
    this.groundAggregates = scene_builder(scene);

    const { characterMesh, characterAggregate, characterAnimations } = character_builder(scene);
    this.characterMesh = characterMesh;
    this.characterAggregate = characterAggregate;
    this.characterAnimations = characterAnimations;

    this.input = new CharacterInput();

    this.fsm = new CharacterFsm({
      hasFuel: () => this.activeJetpackPhysics?.hasFuel() ?? true,
      onEnterEquippingJetpack: () => this._swapToJetpack(),
      onEnterStandAlone: () => this._swapToStandAlone(),
    });

    // Arranca directo en StandAlone (estado inicial de la fsm, sin pasar por onEnter).
    // Este es el hito actual: character visible sobre el ground reproduciendo standing_idle.
    this.activeStrategy = await buildStandAloneStrategy(
      this.characterAggregate,
      this.input,
      this.fsm,
      this.characterAnimations,
    );

    this.hud = new CharacterHud(this.fsm);
    this.hud.mount();

    this._bindObservables();
  }

  private _bindObservables(): void {
    this.beforePhysicsObserver = this.scene.onBeforePhysicsObservable.add(() => {
      const dt = this.scene.getEngine().getDeltaTime() / 1000;
      this.fsm.tick();
      this.activeStrategy?.tick(dt);
    });
  }

  /**
   * Disparado por CharacterFsm.onEnter("EquippingJetpack") vía deps. Al terminar,
   * notifica a la fsm para que complete la transición puente -> Jetpack
   * (notifyJetpackReady(), mismo patrón que notifyJumpImpulseFrame() en poc2).
   */
  private async _swapToJetpack(): Promise<void> {
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

  /** Disparado por CharacterFsm.onEnter("StandAlone") vía deps (vuelta automática, sin combustible). */
  private async _swapToStandAlone(): Promise<void> {
    this.activeJetpackPhysics = null;
    this.activeStrategy?.dispose();
    this.activeStrategy = await buildStandAloneStrategy(
      this.characterAggregate,
      this.input,
      this.fsm,
      this.characterAnimations,
    );
  }

  dispose(): void {
    this.scene?.onBeforePhysicsObservable.remove(this.beforePhysicsObserver);
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