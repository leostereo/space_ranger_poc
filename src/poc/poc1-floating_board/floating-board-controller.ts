import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Controller de física del board flotante.
 *
 * TODO: definir el enfoque:
 *  - Kinemático simple (bobbing + tilt via código, sin Havok) — más rápido de prototipar.
 *  - Basado en física real (Havok): raycast hacia abajo + fuerza de repulsión tipo "hover",
 *    más creíble pero más trabajo de tuning.
 *
 * Por ahora expone la interfaz mínima para que FloatingBoardPoc pueda
 * instanciarlo y llamarlo desde el render loop una vez que se defina.
 */
export class FloatingBoardController {
  constructor(
    private scene: Scene,
    private boardMesh: Mesh,
  ) {}

  /** Se llama en cada frame (scene.onBeforeRenderObservable) una vez implementada la física. */
  update(): void {
    // TODO: floating effect + input de movimiento
  }

  dispose(): void {
    // TODO: liberar observables / recursos propios del controller
  }
}