import type { InputHub } from "@/game/core/input/input-hub";

export interface CharacterInputState {
  forward: boolean;  // W
  backward: boolean; // S
  left: boolean;     // A
  right: boolean;    // D
  up: boolean;       // Space (empuje del jetpack mientras está equipado)
  cruise: boolean;   // Shift — mantenido en Jetpack/On dispara Cruising, al soltar vuelve a On
  shoot: boolean;     // "," — mantenido en Jetpack/On dispara Shooting, Shift tiene prioridad
  crouch: boolean;   // "." — mantenido en OnGround (Idle/Walking/WalkingBackwards) dispara Crouch
  shield: boolean;   // "/" — mantenido en OnGround (Idle/Walking/WalkingBackwards/Strafe, CrouchIdle) levanta el escudo
}

/**
 * Estado de entrada del personaje, armado en cada frame a partir del InputHub (teclado y, más adelante,
 * gamepad). Ya no escucha la ventana: el hub es el único que conoce los dispositivos.
 */
export class CharacterInput {
  private state: CharacterInputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    cruise: false,
    shoot: false,
    crouch: false,
    shield: false,
  };

  /**
   * Único flag para equipar (L): no distingue jetpack/board, eso lo decide
   * CharacterFsm.requestEquipment() según el sub-estado activo.
   */
  private equipRequested = false;
  private jumpRequested = false;
  private crouchRollRequested = false;

  constructor(private readonly hub: InputHub) {}

  get current(): CharacterInputState {
    return this.state;
  }

  /** Copia la entrada del hub. Se llama una vez por frame, antes de que corran las strategies. */
  update(): void {
    const { hub, state } = this;
    state.forward = hub.isHeld("moveForward");
    state.backward = hub.isHeld("moveBackward");
    state.left = hub.isHeld("turnLeft");
    state.right = hub.isHeld("turnRight");
    state.up = hub.isHeld("jump");
    state.cruise = hub.isHeld("cruise");
    state.shoot = hub.isHeld("shoot");
    state.crouch = hub.isHeld("crouch");
    state.shield = hub.isHeld("shield");

    // Pedidos puntuales: se consumen una sola vez.
    if (hub.wasPressed("jump")) this.jumpRequested = true;
    if (hub.wasPressed("crouch")) this.crouchRollRequested = true; // edge trigger
    if (hub.wasReleased("equip")) this.equipRequested = true; // se pide al SOLTAR la tecla, como antes
  }

  consumeEquipRequest(): boolean {
    if (!this.equipRequested) return false;
    this.equipRequested = false;
    return true;
  }

  consumeJumpRequest(): boolean {
    if (!this.jumpRequested) return false;
    this.jumpRequested = false;
    return true;
  }

  consumeCrouchRollRequest(): boolean {
    if (!this.crouchRollRequested) return false;
    this.crouchRollRequested = false;
    return true;
  }

  dispose(): void {
    // Sin listeners propios: el InputHub es de todo el juego y lo libera Game.
  }
}