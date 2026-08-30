import { Mesh, Vector3 } from "@babylonjs/core";

export class FisicaController {
  private _mesh: Mesh;
  private _velocidad: Vector3 = Vector3.Zero();
  private _gravedad: number = -9.81; // Metros por segundo cuadrado

  constructor(mesh: Mesh) {
    this._mesh = mesh;
    console.log("FisicaController inicializado para el mesh:", mesh.name);
  }

  public actualizarFisica(delta: number): void {
    // Si la altura es mayor a 0, aplicamos gravedad (caída libre)
    if (this._mesh.position.y > 0) {
      this._velocidad.y += this._gravedad * delta;
    } else {
      // Tocó el suelo: frenamos la velocidad de caída y reseteamos a ras del piso
      this._velocidad.y = 0;
      this._mesh.position.y = 0;
    }

    // Aplicamos el desplazamiento basado en la velocidad actual
    this._mesh.position.addInPlace(this._velocidad.scale(delta));
  }

  public estaEnElSuelo(): boolean {
    return this._mesh.position.y <= 0;
  }

  public obtenerVelocidad(): Vector3 {
    return this._velocidad;
  }
}
