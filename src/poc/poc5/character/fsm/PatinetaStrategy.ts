import { InputController } from "../controllers/InputController";
import { CharacterContext } from "./CharacterMain";
import { LocomotionStrategy } from "./contracts/LocomotionStrategy";


export class PatinetaStrategy implements LocomotionStrategy {
  public readonly name = "Modo_Patineta";
  private _contexto: CharacterContext;

  constructor(contexto: CharacterContext) {
    this._contexto = contexto;
  }

  public entrar(contexto: CharacterContext): void {
    this._contexto = contexto;
    console.log("🛹 ¡Patineta conectada con éxito!");
    this._contexto.animController.play("skate_ride");
  }

  public actualizar(inputs: InputController, delta: number): void {
    console.log("[Patineta Loop] Avanzando sobre ruedas... presione Ctrl no hace nada acá.");
  }

  public salir(): void {
    console.log("Patineta: Guardando la tabla.");
  }
}