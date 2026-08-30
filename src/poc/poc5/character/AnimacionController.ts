import { Mesh } from "@babylonjs/core";

export class AnimacionController {
  constructor(mesh: Mesh) {
    console.log("AnimacionController inicializado para el mesh:", mesh.name);
  }

  public play(animName: string): void {
    console.log(`[Animación] Reproduciendo: ${animName}`);
  }
}