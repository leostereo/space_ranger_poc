import { Mesh, Vector3 } from "@babylonjs/core";
import { LocomotionStrategy } from "./LocomotionStrategy";
import { StandAloneStrategy } from "./StandAloneStrategy";
import { InputController } from "./InputController";
import { AnimacionController } from "./AnimacionController";
import { FisicaController } from "./FisicaController";

export interface CharacterContext {
  mesh: Mesh;
  velocidadActual: Vector3;
  alturaActual: number;
  estaEnElSuelo: boolean;
  animController: AnimacionController;
  fisicaController: FisicaController;
  characterMainRef: CharacterMain;
}

export class CharacterMain {
  private _contexto: CharacterContext;
  private _estrategiaActiva: LocomotionStrategy;

  constructor(
    mesh: Mesh,
    animController: AnimacionController,
    fisicaController: FisicaController
  ) {
    this._contexto = {
      mesh: mesh,
      velocidadActual: Vector3.Zero(),
      alturaActual: mesh.position.y,
      estaEnElSuelo: fisicaController.estaEnElSuelo(),
      animController: animController,
      fisicaController: fisicaController,
      characterMainRef: this
    };

    // Al instanciarse, la FSM se creará evaluando el estado inicial real
    this._estrategiaActiva = new StandAloneStrategy(this._contexto);
    this._estrategiaActiva.entrar(this._contexto);
  }

  public cambiarEstrategia(nuevaEstrategia: LocomotionStrategy): void {
    if (this._estrategiaActiva) {
      console.log(`[Estrategia Global] Saliendo de: ${this._estrategiaActiva.name}`);
      this._estrategiaActiva.salir();
    }

    this._estrategiaActiva = nuevaEstrategia;
    console.log(`[Estrategia Global] Iniciando: ${this._estrategiaActiva.name}`);
    this._estrategiaActiva.entrar(this._contexto);
  }

  public actualizar(inputs: InputController, delta: number): void {
    // 1. Primero corre la simulación física (gravedad, inercia)
    this._contexto.fisicaController.actualizarFisica(delta);

    // 2. Sincronizamos las variables del contexto compartido
    this._contexto.alturaActual = this._contexto.mesh.position.y;
    this._contexto.velocidadActual = this._contexto.fisicaController.obtenerVelocidad();
    this._contexto.estaEnElSuelo = this._contexto.fisicaController.estaEnElSuelo();

    // 3. Evaluamos la lógica de estados
    if (this._estrategiaActiva) {
      this._estrategiaActiva.actualizar(inputs, delta);
    }
  }

  public get contexto(): CharacterContext {
    return this._contexto;
  }
}
