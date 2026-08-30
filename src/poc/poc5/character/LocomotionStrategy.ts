import { CharacterContext } from "./CharacterMain";
import { InputController } from "./InputController";

export interface LocomotionStrategy {
  readonly name: string;
  entrar(contexto: CharacterContext): void;
  actualizar(inputs: InputController, delta: number): void;
  salir(): void;
}