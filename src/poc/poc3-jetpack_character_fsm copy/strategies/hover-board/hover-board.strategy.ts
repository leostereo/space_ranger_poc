// src/poc4-.../strategies/hover-board/hover-board.strategy.ts
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { IVehicleStrategy } from "../contracts/ivehicle-strategy";
import type { CharacterFsm } from "../../character-fsm/character.fsm";
import type { CharacterInput } from "../../character.input";
import { HoverBoardPhysicsController } from "./hover-board.physics.controller";
import { HoverBoardInputAdapter } from "./hover-board.input.adapter";
import { HoverBoardInputController } from "./hover-board.input.controller";
import { HoverBoardAnimationController } from "./hover-board.animation.controller";
import type { ICharacterAnimations } from "@/services/assets-manager";

export interface HoverBoardStrategyResult {
    strategy: IVehicleStrategy;
    physicsController: HoverBoardPhysicsController;
}

/**
 * Factory async por convención del repo (mismo criterio que buildStandAloneStrategy/
 * buildJetpackStrategy). boardMesh/boardAggregate ya vienen creados y parentados
 * (ver _swapToHoverBoard() en character.base.ts, vía board_builder) — esta factory
 * sólo arma los controllers, no toca mesh/parenting.
 */
export async function buildHoverBoardStrategy(
    scene: Scene,
    boardMesh: Mesh,
    boardAggregate: PhysicsAggregate,
    input: CharacterInput,
    characterFsm: CharacterFsm,
    characterAnimations: ICharacterAnimations | null,
): Promise<HoverBoardStrategyResult> {
    const inputAdapter = new HoverBoardInputAdapter(input);

    const physics = new HoverBoardPhysicsController(
        scene,
        boardMesh,
        boardAggregate,
        () => inputAdapter.current,
        characterFsm.boardSubFsm,
    );
    const inputController = new HoverBoardInputController(input, characterFsm);
    const animation = new HoverBoardAnimationController(characterAnimations, characterFsm.boardSubFsm);

    const strategy: IVehicleStrategy = {
        physics,
        input: inputController,
        animation,
        tick(dt: number) {
            inputController.tick();
            physics.tick(dt);
        },
        dispose() {
            physics.dispose();
            inputController.dispose();
        },
    };

    return { strategy, physicsController: physics };
}