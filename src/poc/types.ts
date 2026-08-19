import type { Scene } from "@babylonjs/core/scene";

/**
 * Contrato que debe cumplir cada POC.
 * App crea el engine, la Scene y (si corresponde) habilita la física;
 * cada POC solo la puebla con su contenido.
 */
export interface Poc {
  /** Puebla la Scene ya creada por App (cámara, luces, meshes, física propia del POC). */
  build(scene: Scene, canvas: HTMLCanvasElement): Promise<void>;

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