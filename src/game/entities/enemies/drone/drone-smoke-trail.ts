// src/game/entities/enemies/drone/drone-smoke-trail.ts
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";

const EMIT_RATE = 80; // Densidad del humo constante de avería
const SMOKE_DIRECTION = new Vector3(0, 1, 0); // El humo sube de forma natural

export class DroneSmokeTrail {
  private _smokeEmitter: ParticleSystem;
  private _emitterPosition = new Vector3();
  private _stopped = false;
  private _isDisposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly anchorNode: TransformNode, // Nodo visual o root del dron a seguir
    private readonly flareTexture: Texture
  ) {
    this._smokeEmitter = this._createEmitter("droneSmokeTrail");
  }

  private _createEmitter(name: string): ParticleSystem {
    // Inicializamos un pool de 300 partículas máximo
    const ps = new ParticleSystem(name, 300, this.scene);
    
    // Clonamos la textura compartida del registro para evitar fugas visuales
    ps.particleTexture = this.flareTexture.clone();

    // Pequeño volumen inicial para que el humo nazca del interior del dron
    ps.minEmitBox = new Vector3(-0.1, -0.1, -0.1);
    ps.maxEmitBox = new Vector3(0.1, 0.1, 0.1);

    // Conectamos la referencia de posición reactiva
    ps.emitter = this._emitterPosition;

    // 🟢 PALETA DE COLOR: Humo gris oscuro/negro denso que se disipa a gris claro traslúcido
    ps.color1 = new Color4(0.2, 0.2, 0.2, 0.9);     // Nacimiento: Negro espeso
    ps.color2 = new Color4(0.3, 0.3, 0.3, 0.5);     // Vida media: Gris ceniza
    ps.colorDead = new Color4(0.5, 0.5, 0.5, 0.0); // Muerte: Transparente absoluto

    // Configuración física del humo (Se expande a medida que asciende)
    ps.minSize = 0.2;
    ps.maxSize = 0.6;
    
    // Tiempo de vida más largo que el jetpack para dejar una estela visible en el aire (1.0 a 1.5s)
    ps.minLifeTime = 1.0;
    ps.maxLifeTime = 1.5;

    ps.emitRate = EMIT_RATE;
    
    // Velocidad de flotabilidad térmica (Sube despacio)
    ps.minEmitPower = 0.5;
    ps.maxEmitPower = 1.5;
    ps.updateSpeed = 0.015;

    // Direcciones de dispersión cónica hacia arriba
    ps.direction1 = new Vector3(-0.2, 1.0, -0.2);
    ps.direction2 = new Vector3(0.2, 1.5, 0.2);

    // Gravedad inversa o viento simulado para arrastrar el humo ligeramente hacia atrás en Z
    ps.gravity = new Vector3(0, 0.5, -1.0);

    ps.onDisposeObservable.addOnce(() => {
      this._isDisposed = true;
    });

    ps.start();
    return ps;
  }

  /**
   * Actualiza la posición del emisor acoplándose al transform del dron.
   */
  public update(): void {
    if (this._stopped || this._isDisposed) return;

    // Sigue milimétricamente la rotación caótica y posición absoluta del dron herido
    this._emitterPosition.copyFrom(this.anchorNode.getAbsolutePosition());
  }

  /**
   * Apaga el emisor de forma limpia. El humo en el aire termina su ciclo de vida solo.
   */
  public stop(): void {
    if (this._stopped) return;
    this._stopped = true;

    this._smokeEmitter.emitRate = 0;
    this._smokeEmitter.disposeOnStop = true;
    this._smokeEmitter.stop();
  }

  /**
   * Liberación forzada de seguridad si se destruye el nivel repentinamente.
   */
  public dispose(): void {
    if (this._isDisposed) return;
    this._smokeEmitter.dispose();
  }
}
