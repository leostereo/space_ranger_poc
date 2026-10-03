// En tu archivo poc5.scene.ts
import { MeshBuilder, PhysicsAggregate, PhysicsShapeType, Scene } from "@babylonjs/core";
import { characterAndEquipment_builder } from "../poc3-jetpack_character_fsm copy/utils/buildUtils";
import { AssetManager } from "@/services/assets-manager";
import { Poc } from "../types";

export default class enemies implements Poc {

    // 1. Transformamos la firma del método a 'async' para poder usar await
    public async build(scene: Scene, _canvas: HTMLCanvasElement): Promise<void> {
        try {
            const light = AssetManager.getLight("main", false, "light");
            light.setEnabled(true);


            const buildResult = characterAndEquipment_builder(scene);

        } catch (error) {
            console.error("[POC6 Exception] Error durante el build de la escena:", error);
            throw error; // Re-lanzamos para que el framework del juego sepa que falló
        }
    }
}
