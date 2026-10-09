// src/poc3-jetpack_character_fsm/character-fsm/character.fsm.jetpack.ts
import { Observable } from "@babylonjs/core/Misc/observable";
import { BaseFsm, TransitionTable } from "../../abstract/base-fsm";

export type JetpackSubState = "On" | "Cruising" | "Shooting";

export interface JetpackFsmDeps {
  isCruiseHeld: () => boolean;
  isShootHeld: () => boolean;
  onEnterShooting: () => void; // NUEVO
  onExitShooting: () => void;  // NUEVO
}

export class JetpackFsm extends BaseFsm<JetpackSubState> {
  protected transitions: TransitionTable<JetpackSubState> = {
    On: {
      Cruising: () => this.deps.isCruiseHeld(),
      // Shift tiene prioridad: si está sostenido, ni siquiera se evalúa entrar a Shooting.
      Shooting: () => this.deps.isShootHeld() && !this.deps.isCruiseHeld(),
    },
    Cruising: {
      On: () => !this.deps.isCruiseHeld(),
      // Nota: no hay transición Cruising -> Shooting — mientras se cruisea, "/" se ignora.
    },
    Shooting: {
      On: () => !this.deps.isShootHeld() && !this.deps.isCruiseHeld(),
      // Si sueltan "/" pero agarran Shift en el mismo instante, salta directo a Cruising
      // en vez de pasar por On primero (evita un tick de latencia).
      Cruising: () => this.deps.isCruiseHeld(),
    },
  };

  /** NUEVO — el animation controller se suscribe para reproducir el clip de muerte (death_onAir). */
  readonly onDeathObservable = new Observable<void>();
  /** NUEVO — el animation controller se suscribe para cambiar el clip cuando quien murió en jetpack toca el piso. */
  readonly onDeadLandingObservable = new Observable<void>();

  constructor(private deps: JetpackFsmDeps) {
    super();
    this.state = "On";
  }

  /**
   * NUEVO — en jetpack todo el vuelo es "aire": cualquier sub-estado recibe hits.
   * Igual que standAlone>OnAir, un hit sólo descuenta vida (sin reacción visual ni stun).
   */
  canReceiveHit(): boolean {
    return true;
  }

  /** NUEVO — llamado por CharacterFsm justo antes de pasar a "Dead". */
  notifyDeath(): void {
    this.onDeathObservable.notifyObservers();
  }

  /** NUEVO — llamado por el physics controller cuando un personaje muerto en jetpack toca el piso. */
  notifyDeadLanding(): void {
    this.onDeadLandingObservable.notifyObservers();
  }

  protected onEnter(state: JetpackSubState): void {
    if (state === "Shooting") this.deps.onEnterShooting();
  }

  protected onExit(state: JetpackSubState): void {
    if (state === "Shooting") this.deps.onExitShooting();
  }
  dispose(): void {
    this.onDeathObservable.clear(); // NUEVO
    this.onDeadLandingObservable.clear(); // NUEVO
  }
}