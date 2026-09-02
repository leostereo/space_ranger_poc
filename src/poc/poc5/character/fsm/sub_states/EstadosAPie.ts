import { Vector3 } from "@babylonjs/core";
import { InputController } from "../../controllers/InputController";
import { CharacterContext } from "../CharacterMain";
import { PatinetaStrategy } from "../PatinetaStrategy";
import { SubEstado } from "../contracts/ISubEstado";


// --- SUBESTADO: EN EL SUELO (ACTUALIZADO CON MOVIMIENTO) ---
export class EstadoOnGround implements SubEstado {
  public readonly nombre = "onGround";
  private _caminandoAnterior: boolean = false;

  constructor(private _contexto: CharacterContext, private _strategy: any) { }

  public entrar(): void {
    console.log("[SubEstado] -> Entró a: ON_GROUND");
    this._contexto.animController.play("idle_en_suelo");
    this._caminandoAnterior = false;
  }

  // En tu clase EstadoOnGround dentro de character/fsm/sub_states/EstadosAPie.ts

  public actualizar(inputs: InputController, delta: number): void {
    // REGLA 1: Si presionamos espacio, empezamos a tomar impulso (Salto prioritario)
    // REGLA 1: Si presionamos espacio, empezamos a tomar impulso (Salto prioritario)
    if (inputs.salto) {
      console.log("[SubEstado OnGround] -> ¡Espacio presionado! Frenando inercia horizontal para el impulso.");

      // Forzamos al motor físico de Havok a clavar el movimiento horizontal (X y Z) en cero absoluto,
      // pero preservamos la velocidad en Y por si venía de un plano inclinado o amortiguación.
      const body = this._contexto.mesh.physicsBody;
      if (body) {
        const vActual = body.getLinearVelocity();
        body.setLinearVelocity(new Vector3(0, vActual.y, 0));
      }

      // Apagamos visualmente la animación de caminata si venía moviéndose
      this._caminandoAnterior = false;

      // Saltamos al subestado de impulso
      this._strategy.cambiarSubEstado(new EstadoJumpImpulseStart(this._contexto, this._strategy));
      return;
    }

    // REGLA 2: Si nos caemos del borde de una plataforma (gracias al Raycast real)
    if (!this._contexto.estaEnElSuelo) {
      this._strategy.cambiarSubEstado(new EstadoOnAir(this._contexto, this._strategy));
      return;
    }

    // REGLA 3: Reactividad de Animaciones
    // El movimiento físico en sí ya corre solo en el CharacterMain, acá en la FSM solo
    // evaluamos el input para decidir si el Ranger debe cambiar el ciclo visual del GLB.
    if (inputs.adelante !== this._caminandoAnterior) {
      this._caminandoAnterior = inputs.adelante;

      if (inputs.adelante) {
        console.log("[SubEstado OnGround] -> Personaje empezó a caminar.");
        this._contexto.animController.play("Walking");
      } else {
        console.log("[SubEstado OnGround] -> Personaje se detuvo.");
        this._contexto.animController.play("Idle");
      }
    }
  }


  public salir(): void {
    console.log("[SubEstado] -> Saliendo de: ON_GROUND");
  }
}

// --- SUBESTADO: TOMANDO IMPULSO (CON FALLBACK AUTOMÁTICO) ---
export class EstadoJumpImpulseStart implements SubEstado {
  public readonly nombre = "jumpImpulseStart";
  private _tiempoEnImpulso: number = 0;
  private _duracionMaxImpulso: number = 0.5; // 500 milisegundos de espera máxima
  private _yaDespego: boolean = false;

  constructor(private _contexto: CharacterContext, private _strategy: any) { }

  public entrar(): void {
    console.log("[SubEstado] -> Entró a: JUMP_IMPULSE_START");
    this._tiempoEnImpulso = 0;
    this._yaDespego = false;

    // Intentamos colgar el evento nativo por si BabylonJS lo procesa bien
    this._contexto.animController.onFrameClaveDisparado = () => {
      this.ejecutarDespegueFisico("AnimationEvent Nativo");
    };

    // Forzamos la reproducción de la animación de salto desde el controlador
    this._contexto.animController.play("jumpImpulseStart");
  }

  public actualizar(inputs: InputController, delta: number) {
    // Si ya se ejecutó el despegue, no hacemos nada más
    if (this._yaDespego) return;

    // Sumamos el tiempo real transcurrido en este frame de BabylonJS
    this._tiempoEnImpulso += delta;

    // FALLBACK: Si pasó el tiempo límite y el evento de animación falló, forzamos el salto
    if (this._tiempoEnImpulso >= this._duracionMaxImpulso) {
      this.ejecutarDespegueFisico("Temporizador Fallback FSM");
    }
  }

  private ejecutarDespegueFisico(origen: string): void {
    if (this._yaDespego) return;
    this._yaDespego = true;

    // Limpiamos la escucha para evitar fugas de memoria
    this._contexto.animController.onFrameClaveDisparado = null;

    console.log(`[SubEstado JumpImpulse] -> Despegando desatado por: [${origen}]`);

    // Aplicamos la fuerza vertical de Havok (10 unidades)
    const FUERZA_SALTO_REAL = 10.0;
    this._contexto.fisicaController.aplicarImpulsoVertical(FUERZA_SALTO_REAL);

    // Cambiamos al estado en el aire
    this._strategy.cambiarSubEstado(new EstadoOnAir(this._contexto, this._strategy));
  }

  public salir(): void {
    console.log("[SubEstado] -> Saliendo de: JUMP_IMPULSE_START");
  }
}


// --- SUBESTADO: EN EL AIRE ---
export class EstadoOnAir implements SubEstado {
  public readonly nombre = "onAir";

  // DECLARAMOS LA PROPIEDAD AQUÍ PARA RESOLVER EL ERROR TS(2339)
  private _caminandoAnterior: boolean = false;

  constructor(private _contexto: CharacterContext, private _strategy: any) { }

  public entrar(): void {
    console.log("[SubEstado] -> Entró a: ON_AIR (Caída libre / Ascendiendo)");
    this._contexto.animController.play("onAir"); // Reproduce falling_idle
    this._caminandoAnterior = false;
  }

  public actualizar(inputs: InputController, delta: number): void {
    // REGLA 1: Si el Raycast físico detecta el suelo y estamos cerca de la base
    if (this._contexto.estaEnElSuelo && this._contexto.alturaActual < 0.5) {
      this._strategy.cambiarSubEstado(new EstadoOnGround(this._contexto, this._strategy));
      return;
    }

    // REGLA 2: El truco de la patineta (Enganchar la tabla en el aire)
    if (inputs.ctrl) {
      console.log("[SubEstado OnAir] -> ¡Combinación detectada! Saltando a Estrategia Patineta.");
      const nuevaEstrategia = new PatinetaStrategy(this._contexto);
      this._contexto.characterMainRef.cambiarEstrategia(nuevaEstrategia);
      return;
    }

    // [OPCIONAL] Si quisieras que use la variable _caminandoAnterior en el aire
    // para algo visual, podés evaluar inputs.adelante aquí. Si no se usa en este frame,
    // el solo hecho de tenerla declarada arriba ya repara el error de compilación.
  }

  public salir(): void {
    console.log("[SubEstado] -> Saliendo de: ON_AIR");
  }
}
