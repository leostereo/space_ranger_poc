import { LocomotionStrategy } from "./LocomotionStrategy";
import { CharacterContext } from "./CharacterMain";
import { InputController } from "./InputController";
import { PatinetaStrategy } from "./PatinetaStrategy";

type SubEstadosAPie = "onGround" | "onAir";

export class StandAloneStrategy implements LocomotionStrategy {
  public readonly name = "StandAlone_APie";
  private _contexto: CharacterContext;
  private _subEstadoActivo!: SubEstadosAPie; 

  constructor(contexto: CharacterContext) {
    this._contexto = contexto;
  }

  public entrar(contexto: CharacterContext): void {
    this._contexto = contexto;
    
    // Evaluamos dinámicamente cómo entra al mundo
    this.evaluarSubEstado();
    console.log(`StandAlone inicializado. SubEstado inicial: ${this._subEstadoActivo}`);
  }

  public actualizar(inputs: InputController, delta: number): void {
    // Guardamos el estado anterior para detectar el "mili-segundo del cambio" en logs
    const estadoAnterior = this._subEstadoActivo;

    // Evaluamos frame a frame las condiciones de la física
    this.evaluarSubEstado();

    if (estadoAnterior !== this._subEstadoActivo) {
      console.log(`[FSM Interna] Cambió subestado a: ${this._subEstadoActivo}`);
      this._contexto.animController.play(this._subEstadoActivo === "onGround" ? "idle_en_suelo" : "caida_libre");
    }

    console.log(`[StandAlone Loop] Altura Y: ${this._contexto.alturaActual.toFixed(2)} | SubEstado: ${this._subEstadoActivo}`);

    // Política especial: Si está en el aire y aprieta Ctrl -> activa skate
    if (this._subEstadoActivo === "onAir" && inputs.ctrl) {
      const nuevaEst = new PatinetaStrategy(this._contexto);
      this._contexto.characterMainRef.cambiarEstrategia(nuevaEst);
    }
  }

  private evaluarSubEstado(): void {
    this._subEstadoActivo = this._contexto.estaEnElSuelo ? "onGround" : "onAir";
  }

  public salir(): void {
    console.log("StandAlone: Saliendo del modo a pie.");
  }
}
