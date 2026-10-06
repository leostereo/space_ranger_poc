import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Dependencias compartidas que reciben los estados de la GameFsm.
 * Mantenerlo chico y de solo lectura: si empieza a crecer, inyectar
 * lo necesario por constructor en cada estado en vez de agregarlo acá.
 */
export interface GameContext {
  readonly scene: Scene;
  readonly engine: AbstractEngine;
  readonly canvas: HTMLCanvasElement;
}
