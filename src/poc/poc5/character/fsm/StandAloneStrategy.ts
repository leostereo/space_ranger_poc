import { LocomotionStrategy } from "./contracts/LocomotionStrategy";
import { CharacterContext } from "./CharacterMain";
import { InputController } from "../controllers/InputController";
import { EstadoOnAir, EstadoOnGround } from "./sub_states/EstadosAPie";
import { SubEstado } from "./contracts/ISubEstado";

export class StandAloneStrategy implements LocomotionStrategy {
  public readonly name = "StandAlone_APie";
  private _contexto!: CharacterContext;
  private _subEstadoActivo!: SubEstado;

  constructor(contexto: CharacterContext) {
    this._contexto = contexto;
  }

  public entrar(contexto: CharacterContext): void {
    this._contexto = contexto;
    console.log("StandAlone: Inicializando comportamiento general de locomoción a pie.");

    if (this._contexto.estaEnElSuelo) {
      this.cambiarSubEstado(new EstadoOnGround(this._contexto, this));
    } else {
      this.cambiarSubEstado(new EstadoOnAir(this._contexto, this));
    }
  }

  public actualizar(inputs: InputController, delta: number): void {
    console.log(`[StandAlone Loop] Altura Y: ${this._contexto.alturaActual.toFixed(2)} | SubEstado Clase: ${this._subEstadoActivo.nombre}`);

    if (this._subEstadoActivo) {
      this._subEstadoActivo.actualizar(inputs, delta);
    }
  }

  public cambiarSubEstado(nuevoSubEstado: SubEstado): void {
    if (this._subEstadoActivo) {
      this._subEstadoActivo.salir();
    }
    this._subEstadoActivo = nuevoSubEstado;
    this._subEstadoActivo.entrar();
  }

  public salir(): void {
    if (this._subEstadoActivo) {
      this._subEstadoActivo.salir();
    }
    console.log("StandAlone: Estrategia de a pie completamente desmontada.");
  }
}
