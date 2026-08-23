// src/poc3-jetpack_character_fsm/strategies/jetpack/jetpack.input.controller.ts
import type { IInputController } from "../contracts/iinput-controller";

/**
 * Por ahora no hay nada que traducir: el empuje (Space/`up`) lo lee directo
 * JetpackPhysicsController, y la salida de Jetpack es un guard automático (sin
 * combustible), no una acción de input. Se deja la clase igual para mantener el mismo
 * "shape" que NoVehicle y no tener que introducirla más adelante a mitad de camino.
 */
export class JetpackInputController implements IInputController {
  tick(): void {}
  dispose(): void {}
}
