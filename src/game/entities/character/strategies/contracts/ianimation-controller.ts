// src/poc3-jetpack_character_fsm/strategies/contracts/ianimation-controller.ts

/**
 * Placeholder por ahora (box mesh, sin modelo animado) — mismo estado que poc1/poc2 en
 * este punto. El punto importante a futuro (ver poc3.md, "animator con escritura hacia la
 * FSM") es que estas clases van a necesitar además un método propio no genérico
 * (ej. notifyLandingFrame()) llamado desde afuera, igual que notifyJumpImpulseFrame() en
 * BoardFsmHovering — eso no entra en esta interfaz mínima porque es específico de cada
 * sub-fsm, no algo que el contrato genérico pueda expresar.
 */
export interface IAnimationController {
  tick(): void;
  dispose(): void;
}
