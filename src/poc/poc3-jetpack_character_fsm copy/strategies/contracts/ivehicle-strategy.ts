// src/poc3-jetpack_character_fsm/strategies/contracts/ivehicle-strategy.ts
import type { IPhysicsController } from "./iphysics-controller";
import type { IInputController } from "./iinput-controller";
import type { IAnimationController } from "./ianimation-controller";

/**
 * No tiene build() en la interfaz a propósito: cada strategy se construye vía una función
 * factory async standalone (buildNoVehicleStrategy / buildJetpackStrategy), no vía un
 * método de instancia — evita el problema de "objeto a medio construir" mientras el
 * build() está en vuelo. dispose()/tick() sí son parte de la interfaz porque se llaman
 * repetidamente sobre una instancia ya completa.
 */
export interface IVehicleStrategy {
  readonly physics: IPhysicsController;
  readonly input: IInputController;
  readonly animation: IAnimationController;

  tick(dt: number): void;
  dispose(): void;
}
