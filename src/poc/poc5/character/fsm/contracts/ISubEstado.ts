import { InputController } from "../../controllers/InputController";

export interface SubEstado {
  readonly nombre: string;
  entrar(): void;
  actualizar(inputs: InputController, delta: number): void;
  salir(): void;
}
