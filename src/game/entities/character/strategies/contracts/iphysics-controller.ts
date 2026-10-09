// src/poc3-jetpack_character_fsm/strategies/contracts/iphysics-controller.ts

export interface IPhysicsController {
  /** Llamar en scene.onBeforePhysicsObservable, mismo criterio que BoardController.update(). */
  tick(dt: number): void;

  /**
   * IMPORTANTE: no dispone characterMesh/characterAggregate — esas son compartidas y las
   * posee character.base.ts (ver nota en poc3.md sobre por qué NO hace falta transform
   * handoff entre NoVehicle y Jetpack). dispose() acá es sólo para recursos propios de la
   * strategy (ej. estado de combustible no necesita dispose, pero un futuro emisor de
   * partículas del thruster sí).
   */
  dispose(): void;
}
