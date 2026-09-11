// En tu archivo poc5.scene.ts
import { CharacterMain } from "./character/fsm/CharacterMain";
import { InputController } from "./character/controllers/InputController";
import { AnimacionController } from "./character/controllers/AnimacionController";
import { FisicaController } from "./character/controllers/FisicaController";
import { MeshBuilder, PhysicsAggregate, PhysicsShapeType, Scene } from "@babylonjs/core";
import { character_builder } from "../poc3-jetpack_character_fsm copy/utils/buildUtils";
import { AssetManager } from "@/services/assets-manager";
import { Poc } from "../types";

export default class poc5 implements Poc {

    // 1. Transformamos la firma del método a 'async' para poder usar await
    public async build(scene: Scene, canvas: HTMLCanvasElement): Promise<void> {
        try {
            const light = AssetManager.getLight("main", false, "light");
            light.setEnabled(true);

            // TODO: reemplazar por AssetManager.getMesh('ground-basic' | 'ground-grid', ...) cuando
            // _builGrounds() esté activo en AssetManager (hoy está comentado ahí).
            const ground = MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, scene);
            const groundAggregate = new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);

            // [CRÍTICO]: Si tu proyecto requiere inicializar o esperar las cargas del AssetManager,
            // deberías meter el await de la carga general acá, por ejemplo:
            // await AssetManager.cargarTodo(); // Descomentá o adaptá según el método real de tu servicio

            // En tu método build() de poc5.scene.ts:
            const buildResult = character_builder(scene);

            const inputs = new InputController(scene);
            const anims = new AnimacionController(buildResult.characterMesh, buildResult.characterAnimations);

            // [ACTUALIZADO] Le inyectamos la escena y el Aggregate real de Havok para congelar las inercias
            const physics = new FisicaController(scene, buildResult.characterAggregate);

            const personaje = new CharacterMain(buildResult.characterMesh, anims, physics);


            scene.onBeforeRenderObservable.add(() => {
                const engine = scene.getEngine();
                const delta = engine.getDeltaTime() / 1000;

                personaje.actualizar(inputs, delta);
            });

            console.log("[POC5] -> Wiring y orquestación inicializados con éxito.");

        } catch (error) {
            console.error("[POC5 Exception] Error durante el build de la escena:", error);
            throw error; // Re-lanzamos para que el framework del juego sepa que falló
        }
    }
}
