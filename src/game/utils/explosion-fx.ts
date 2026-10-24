import { EngineStore } from "@babylonjs/core/Engines/engineStore"; // 🟢 Importamos el almacén central de Babylon
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { SphereParticleEmitter } from "@babylonjs/core/Particles/EmitterTypes/sphereParticleEmitter";

export class ExplosionFX {
  /**
   * Spawnea un efecto visual de explosión autónomo resolviendo
   * automáticamente la escena activa y la textura de la caché.
   */
  static spawn(position: Vector3): void {
    // 🟢 RESOLUCIÓN DE ESCENA AUTÓNOMA:
    // Captura de forma global la escena activa que está corriendo en el bucle principal
    const scene = EngineStore.LastCreatedScene;
    if (!scene) {
      if (import.meta.env.DEV) {
        console.error("[ExplosionFX] Error: No se encontró ninguna escena activa en el EngineStore.");
      }
      return;
    }

    // 🟢 RESOLUCIÓN DE TEXTURA POR CACHÉ:
    // Buscamos la textura "flare" que tu AssetRegistry ya inyectó previamente en el gestor de la escena
    const flareTexture = scene.getTextureByName("flare");
    if (!flareTexture) {
      if (import.meta.env.DEV) {
        console.warn("[ExplosionFX] Advertencia: Textura 'flare' no encontrada en la caché de la escena. Usando fallback procedural.");
      }
    }

    // 1. Nodo Ancla (Ciclo de vida centralizado)
    const anchor = new Mesh("explosion_anchor", scene);
    anchor.position.copyFrom(position);

    // 2. Capa de Destello (Flash de Luz dinámico)
    const flashLight = new PointLight("explosion_light", Vector3.Zero(), scene);
    flashLight.parent = anchor;
    flashLight.diffuse = new Color3(1, 0.6, 0.2);
    flashLight.specular = new Color3(1, 1, 0.8);
    flashLight.intensity = 40.0;
    flashLight.range = 8.0;

    // 3. Capa de Onda de Choque (Esfera Expansiva)
    const shockwave = MeshBuilder.CreateSphere("explosion_shockwave", { diameter: 1, segments: 16 }, scene);
    shockwave.parent = anchor;
    shockwave.isPickable = false;
    shockwave.checkCollisions = false;

    const shockMaterial = new StandardMaterial("shockwave_mat", scene);
    shockMaterial.diffuseColor = Color3.Black();
    shockMaterial.emissiveColor = new Color3(1, 0.35, 0.05);
    shockMaterial.specularColor = Color3.Black();
    shockMaterial.alphaMode = 2; // Engine.ALPHA_ADD
    shockMaterial.alpha = 0.9;
    shockwave.material = shockMaterial;

    // 4. Capa de Partículas (Chispas incandescentes)
    if (flareTexture) {
      const pSystem = new ParticleSystem("explosion_particles", 40, scene);
      pSystem.particleTexture = flareTexture.clone(); // Clonamos para aislar su ciclo de vida
      pSystem.emitter = anchor;
      
      pSystem.particleEmitterType = new SphereParticleEmitter(0.2);
      
      pSystem.color1 = new Color3(1, 0.7, 0.2).toColor4(1.0);
      pSystem.color2 = new Color3(1, 0.2, 0.0).toColor4(0.8);
      pSystem.colorDead = new Color3(0.1, 0.1, 0.1).toColor4(0.0);
      
      pSystem.minSize = 0.1;
      pSystem.maxSize = 0.3;
      pSystem.minLifeTime = 0.05;
      pSystem.maxLifeTime = 0.25;
      
      pSystem.minEmitPower = 12.0;
      pSystem.maxEmitPower = 20.0;
      pSystem.gravity = new Vector3(0, -4.0, 0);

      pSystem.targetStopDuration = 0.1;
      pSystem.disposeOnStop = true;
      pSystem.start();
    }

    // 5. Animación Cuadro a Cuadro por Software
    let elapsed = 0;
    const duration = 0.25; // Versión de ráfaga rápida calibrada

    const updateObserver = scene.onBeforeRenderObservable.add(() => {
      const dt = scene.getEngine().getDeltaTime() / 1000;
      elapsed += dt;
      const progress = Math.min(elapsed / duration, 1);

      if (shockwave && !shockwave.isDisposed()) {
        const currentScale = 1.0 + progress * 5.0;
        shockwave.scaling.setAll(currentScale);
        shockMaterial.alpha = 0.9 * (1.0 - progress);
      }

      if (flashLight && !flashLight.isDisposed()) {
        flashLight.intensity = 40.0 * Math.max(0, 1.0 - (progress * 6.0));
      }

      if (progress >= 1) {
        scene.onBeforeRenderObservable.remove(updateObserver);
        // Destrucción recursiva total y liberación en la GPU de mallas y materiales
        anchor.dispose(false, true); 
      }
    });
  }
}
