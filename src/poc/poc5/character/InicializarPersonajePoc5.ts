import { Scene, Mesh } from "@babylonjs/core";
import { InputController } from "./controllers/InputController";
import { AnimacionController } from "./controllers/AnimacionController";
import { FisicaController } from "./controllers/FisicaController";
import { CharacterMain } from "./fsm/CharacterMain";

export function inicializarPersonajePoc5(scene: Scene, playerMesh: Mesh) {
  const inputs = new InputController(scene);
  const anims = new AnimacionController(playerMesh);
  const physics = new FisicaController(playerMesh);

  const personaje = new CharacterMain(playerMesh, anims, physics);

  scene.onBeforeRenderObservable.add(() => {
    const engine = scene.getEngine();
    const delta = engine.getDeltaTime() / 1000;

    personaje.actualizar(inputs, delta);
  });
}