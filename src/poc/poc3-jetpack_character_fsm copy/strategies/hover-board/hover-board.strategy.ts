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
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { ProjectileWeaponController } from "../weapon/projectile-weapon.controller";

export interface HoverBoardStrategyResult {
    strategy: IVehicleStrategy;
    physicsController: HoverBoardPhysicsController;
}

export async function buildHoverBoardStrategy(
    scene: Scene,
    boardMesh: Mesh,
    boardAggregate: PhysicsAggregate,
    input: CharacterInput,
    characterFsm: CharacterFsm,
    characterAnimations: ICharacterAnimations | null,
    characterMesh: AbstractMesh, // NUEVO — para excludeMeshes (no hay characterAggregate propio acá)
    weaponMuzzle: TransformNode, // NUEVO
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
    const animation = new HoverBoardAnimationController(
        characterAnimations,
        characterFsm.boardSubFsm,
        () => input.current.shoot, // NUEVO
    );
    // NUEVO — sin restricción de sub-estado: dispara en cualquier momento que se
    // sostenga "/", sin importar Hovering/Falling/Jumping/Diving. La dirección la
    // resuelve el muzzle solo (sigue el forward del characterMesh, que a su vez sigue
    // al boardMesh vía parenting) — no hace falta lógica de apuntado acá.
    const weapon = new ProjectileWeaponController(
        scene,
        weaponMuzzle,
        () => input.current.shoot,
        [boardMesh as AbstractMesh, characterMesh],
    );

    const strategy: IVehicleStrategy = {
        physics,
        input: inputController,
        animation,
        tick(dt: number) {
            inputController.tick();
            physics.tick(dt);
            animation.tick(); // NUEVO — antes faltaba, era inofensivo porque tick() era no-op
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