import type { Engine } from "@babylonjs/core/Engines/engine";
import type { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Contrato que debe cumplir cada POC.
 * Cada POC recibe el engine y el canvas ya creados por App,
 * y es responsable de armar su propia Scene desde cero.
 */
export interface Poc {
  /** Arma la escena del POC. Se llama una vez al seleccionarlo. */
  build(engine: Engine | WebGPUEngine, canvas: HTMLCanvasElement): Promise<Scene>;

  /** Hook opcional para liberar recursos que no dependan de scene.dispose() (listeners globales, etc). */
  dispose?(): void;
}

/** Constructor de un POC (cada módulo de POC exporta una clase que implementa Poc). */
export type PocConstructor = new () => Poc;

/** Entrada del registro: metadata + carga diferida del módulo real del POC. */
export interface PocDefinition {
  id: string;
  label: string;
  description?: string;
  load: () => Promise<{ default: PocConstructor }>;
}