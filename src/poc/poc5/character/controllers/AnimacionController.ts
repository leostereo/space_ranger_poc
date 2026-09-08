import { Mesh, AnimationGroup, AnimationEvent } from "@babylonjs/core";

export class AnimacionController {
  private _animations: any; // Mapeo de animaciones del GLB
  private _currentAnimation: AnimationGroup | null = null;

  // Propiedad pública que el subestado escuchará para el despegue físico
  public onFrameClaveDisparado: (() => void) | null = null;

  constructor(mesh: Mesh, animations: any) {
    this._animations = animations;
    console.log("AnimacionController -> Inicializado con animaciones reales del GLB.");

    // Configuramos el detector de despegue nativo en el archivo de animación
    this.configurarEventoDeDespegue();
  }

  /**
   * Configura un evento nativo de BabylonJS en el frame exacto de la animación de salto
   */
  // Buscá y actualizá este método dentro de AnimacionController.ts

  private configurarEventoDeDespegue(): void {
    // Buscamos el AnimationGroup de salto en tu objeto real de animaciones
    const animacionSalto = this._animations?.jump || this._animations?.standing_jump;

    if (!animacionSalto) {
      console.warn("AnimacionController -> No se encontró la animación de salto ('jump') para inyectar el evento.");
      return;
    }

    // FRAME CLAVE: El cuadro exacto del GLB donde el Ranger estira las piernas
    const frameDeDespegue = 15;

    // Creamos el evento nativo de BabylonJS
    const eventoDespegue = new AnimationEvent(
      frameDeDespegue,
      () => {
        // Este callback se ejecuta en el hilo principal de BabylonJS al pasar por ese frame
        if (this.onFrameClaveDisparado) {
          console.log(`[BabylonJS AnimationEvent] -> ¡Disparado frame ${frameDeDespegue}! Activando impulso físico.`);
          this.onFrameClaveDisparado();
        }
      },
      true // Solo se dispara una vez por reproducción
    );

    // Los AnimationGroups de BabylonJS controlan múltiples huesos/canales.
    // Para que el evento funcione, se debe agregar a las animaciones internas del grupo.
    const targetedAnims = animacionSalto.targetedAnimations;
    if (targetedAnims && targetedAnims.length > 0) {
      // Recorremos las sub-animaciones del grupo para inyectar el evento en el runtime
      for (const targetedAnim of targetedAnims) {
        targetedAnim.animation.addEvent(eventoDespegue);
      }
      console.log(`[Animación] -> Evento de despegue inyectado con éxito en el frame ${frameDeDespegue}.`);
    }
  }


  /**
   * Detiene la animación actual y reproduce el AnimationGroup real de BabylonJS
   * @param nombreEstado Clave del estado que machea con tus animaciones de producción
   */
  public play(nombreEstado: string): void {
    if (!this._animations) return;

    // Traducimos los nombres de los estados lógicos a tus AnimationGroups reales
    let targetAnim: AnimationGroup | null = null;
    let loop: boolean = true;

    switch (nombreEstado) {
      case "Idle":
      case "idle_en_suelo":
        targetAnim = this._animations.standing_idle || null;
        loop = true;
        break;
      case "Walking":
        targetAnim = this._animations.walking_forward || null;
        loop = true;
        break;
      case "Running":
        targetAnim = this._animations.running_normal || null;
        loop = true;
        break;
      case "jumpImpulseStart":
      case "tomando_impulso_salto":
        targetAnim = this._animations.jump || null;
        loop = false; // El impulso o salto inicial se reproduce solo una vez
        break;
      case "onAir":
      case "caida_libre":
        targetAnim = this._animations.falling_idle || null;
        loop = true;
        break;
      case "skate_ride":
        targetAnim = this._animations.skate_ride || null;
        loop = true;
        break;
    }

    // Si no encontramos la animación o ya se está reproduciendo la misma, no hacemos nada
    if (!targetAnim || this._currentAnimation === targetAnim) return;

    // Frenamos la animación vieja de forma limpia
    if (this._currentAnimation) {
      this._currentAnimation.stop();
    }

    // Guardamos la referencia de la nueva animación activa y le damos play nativo
    this._currentAnimation = targetAnim;
    console.log(`[Animación Real] Ejecutando AnimationGroup nativo: ${targetAnim.name} (Loop: ${loop})`);
    this._currentAnimation.play(loop);
  }

  /**
   * Limpieza de recursos al desmontar el controlador
   */
  public dispose(): void {
    if (this._currentAnimation) {
      this._currentAnimation.stop();
    }
  }
}
