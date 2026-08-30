import { Scene, Mesh } from "@babylonjs/core";
import { InputController } from "./InputController";
import { AnimacionController } from "./AnimacionController";
import { FisicaController } from "./FisicaController";
import { CharacterMain } from "./CharacterMain";

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