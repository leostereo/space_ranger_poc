import type { CharacterFsm } from "../character-fsm/character.fsm";
import type { CharacterInput, CharacterInputState } from "../character.input";

const SHIELD_GROUND_STATES = [
  "Idle", "Walking", "WalkingBackwards",
  "ShootingStrafeLeft", "ShootingStrafeRight",
] as const;

const AIM_GROUND_STATES = [
  "Idle", "Walking", "WalkingBackwards", "Running",
  "ShootingStrafeLeft", "ShootingStrafeRight",
  "CrouchIdle", "CrouchWalking", "CrouchWalkingBackwards",
] as const;

export function isShieldActive(groundState: string, input: CharacterInputState): boolean {
  if (!input.shield) return false;
  return (SHIELD_GROUND_STATES as readonly string[]).includes(groundState) || groundState === "CrouchIdle";
}

// Precedencia: con el botón de escudo held, shoot no produce efecto.
export function isStandAloneAimActive(groundState: string, input: CharacterInputState): boolean {
  if (input.shield) return false;
  return (AIM_GROUND_STATES as readonly string[]).includes(groundState) && input.shoot;
}

/**
 * Predicados de combate para TODOS los modos (Jetpack / StandAlone / HoverBoard).
 * Se instancia una vez en character.base.ts y se inyecta a los strategies.
 * Las propiedades son arrow functions para poder pasarlas sueltas (combat.isAiming)
 * sin perder el `this`.
 */
export class CombatRules {
  constructor(
    private fsm: CharacterFsm,
    private input: CharacterInput,
  ) { }

  isAiming = (): boolean => {
    const state = this.input.current;
    switch (this.fsm.getState()) {
      case "Jetpack":
        return this.fsm.jetpackSubFsm.getState() === "Shooting";
      case "StandAlone":
        return isStandAloneAimActive(this.fsm.getActiveSubState(), state);
      case "HoverBoard":
        return !state.shield && state.shoot;
      default:
        return false;
    }
  };

  isShielding = (): boolean => {
    const input = this.input.current;
    switch (this.fsm.getState()) {
      case "StandAlone":
        return isShieldActive(this.fsm.getActiveSubState(), input);
      case "HoverBoard":
        return input.shield;
      default: // Jetpack: sin escudo
        return false;
    }
  };
}