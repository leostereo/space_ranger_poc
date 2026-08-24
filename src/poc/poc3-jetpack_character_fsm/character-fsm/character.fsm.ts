// src/poc3-jetpack_character_fsm/character-fsm/character.fsm.ts
import { BaseFsm, TransitionTable } from "../abstract/base-fsm";
import { StandAloneFsm, type StandAloneSubState } from "./character.fsm.stand-alone";
import { JetpackFsm, type JetpackSubState } from "./character.fsm.jetpack";

export type CharacterMainState = "StandAlone" | "EquippingJetpack" | "Jetpack";

export interface CharacterFsmDeps {
  /** Vive en el padre, igual criterio que isGroundDetected/groundLostElapsed en BoardFsmDeps. */
  hasFuel: () => boolean;
  /** Dispara el build() async de la strategy de Jetpack en character.base.ts. */
  onEnterEquippingJetpack: () => void;
  /** Dispara el swap de vuelta a la strategy de StandAlone en character.base.ts. */
  onEnterStandAlone: () => void;
  // Threading hacia StandAloneFsm (ver StandAloneFsmDeps) — mismo criterio que poc2, donde
  // BoardFsm recibe todas las deps de sus hijas y las reparte en el constructor.
  isGroundDetected: () => boolean;
  onEnterOnAir: () => void;
}

/**
 * Raíz: decide entre StandAlone / EquippingJetpack (puente) / Jetpack.
 * HoverSkate (poc2) se integra en poc4 como tercera rama de este mismo padre.
 */
export class CharacterFsm extends BaseFsm<CharacterMainState> {
  protected transitions: TransitionTable<CharacterMainState>;

  readonly standAloneSubFsm: StandAloneFsm;
  readonly jetpackSubFsm: JetpackFsm;

  // Flag manual para la salida de Jetpack por input (Ctrl) — se combina con el guard
  // automático de combustible en la misma transición (TransitionTable sólo admite un
  // guard por par [origen][destino], así que ambas condiciones viven en una sola función).
  private unequipRequested = false;

  constructor(private deps: CharacterFsmDeps) {
    super();
    this.state = "StandAlone"; // estado inicial: asignado directo, no vía setState

    this.standAloneSubFsm = new StandAloneFsm({
      isGroundDetected: this.deps.isGroundDetected,
      onEnterOnAir: this.deps.onEnterOnAir,
    });
    this.jetpackSubFsm = new JetpackFsm();

    this.transitions = {
      StandAlone: {
        EquippingJetpack: true, // vía requestEquipJetpack()
      },
      EquippingJetpack: {
        // Estado puente: nunca se auto-dispara en tick() (mismo patrón que
        // JumpImpulseStart -> Jumping en poc2). Sólo sale vía notifyJetpackReady(),
        // llamado por character.base.ts cuando termina el build() async de la strategy.
        Jetpack: true,
      },
      Jetpack: {
        // Guard automático: sale por falta de combustible O por pedido manual (Ctrl de
        // nuevo, sin importar el sub-estado de Jetpack) — cualquiera de las dos alcanza.
        StandAlone: () => !this.deps.hasFuel() || this.unequipRequested,
      },
    };
  }

  public override tick(): void {
    super.tick();

    if (this.state === "StandAlone") {
      this.standAloneSubFsm.tick();
    } else if (this.state === "Jetpack") {
      this.jetpackSubFsm.tick();
    }
    // EquippingJetpack: sin sub-fsm activa todavía, sólo espera notifyJetpackReady().
  }

  /**
   * Único punto de entrada de input: el input controller de la strategy activa llama esto,
   * no setState(). Restricción de negocio: sólo se puede equipar el jetpack estando en el
   * aire (OnAir) — no parado ni durante el impulso de salto. El chequeo vive acá, no en el
   * input controller, mismo criterio que el resto de la fsm: la fsm decide qué es válido,
   * el input sólo pide.
   */
  requestEquipJetpack(): void {
    if (this.state === "StandAlone" && this.standAloneSubFsm.getState() === "OnAir") {
      this.setState("EquippingJetpack");
    }
  }

  /** Llamado por character.base.ts, no por ningún controller de input. */
  notifyJetpackReady(): void {
    if (this.state === "EquippingJetpack") {
      this.setState("Jetpack");
    }
  }

  /**
   * Único punto de entrada para volver a StandAlone por decisión del jugador (Ctrl de
   * nuevo mientras está en Jetpack) — no importa el sub-estado de Jetpack en el que esté.
   * Sólo levanta el flag; el guard combinado en `transitions.Jetpack.StandAlone` es quien
   * efectivamente decide y dispara el `setState()` en el próximo `tick()`.
   */
  requestUnequipJetpack(): void {
    if (this.state === "Jetpack") {
      this.unequipRequested = true;
    }
  }

  /** Para el HUD: evita que tenga que conocer standAloneSubFsm/jetpackSubFsm por separado. */
  getActiveSubState(): StandAloneSubState | JetpackSubState | "Loading" {
    if (this.state === "StandAlone") return this.standAloneSubFsm.getState();
    if (this.state === "Jetpack") return this.jetpackSubFsm.getState();
    return "Loading";
  }

  protected onEnter(state: CharacterMainState): void {
    if (state === "EquippingJetpack") this.deps.onEnterEquippingJetpack();
    if (state === "StandAlone") {
      this.deps.onEnterStandAlone();
      this.unequipRequested = false; // reset — si no, la próxima vez que se equipe el jetpack saldría solo
    }
  }

  protected onExit(_state: CharacterMainState): void {
    // sin side-effects por ahora
  }

  dispose(): void {
    this.standAloneSubFsm.dispose();
    this.jetpackSubFsm.dispose();
  }
}