import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

/**
 * Controller encargado exclusivamente de la traslación y rotación del Drone.
 * No toma decisiones lógicas, solo obedece órdenes del Drone/FSM.
 */
export class DummyKamikazeMovementController {
    private readonly targetPosition = new Vector3();
    private isMoving = false;
    private speedMultiplier = 1.0;

    // Variables de configuración de físicas suaves (Ajustables)
    private readonly baseSpeed = 4.0;
    private readonly turnSpeed = 5.0; // Velocidad de rotación (Lerp)

    constructor(
        private readonly root: TransformNode,
        private readonly visual: TransformNode
    ) {
        // Sincronizar posición inicial para evitar saltos bruscos en el primer frame
        this.targetPosition.copyFrom(this.root.position);
    }

    /** Retorna true si el drone completó su trayectoria actual o se encuentra detenido. */
    public get isIdle(): boolean {
        return !this.isMoving;
    }

    /** Modifica la velocidad del drone (útil para acelerar dramáticamente en Chasing). */
    public setSpeedMultiplier(multiplier: number): void {
        this.speedMultiplier = multiplier;
    }

    /** Ordena al drone viajar hacia una coordenada 3D específica. */
    public moveTo(destination: Vector3): void {
        this.targetPosition.copyFrom(destination);
        this.isMoving = true;
    }

    /** Cancela inmediatamente el movimiento actual congelando al drone en su posición. */
    public stop(): void {
        this.targetPosition.copyFrom(this.root.position);
        this.isMoving = false;
    }

    /** Hace que el drone se quede flotando a la espera durante un tiempo determinado. */
    public wait(seconds: number): void {
        this.stop();
        // La espera es gestionada externamente controlando cuándo se le da un nuevo moveTo
    }

    /** Fuerza al drone a rotar de manera fluida mirando directamente hacia un objetivo. */
    public lookAt(targetPosition: Vector3): void {
        const direction = targetPosition.subtract(this.root.position);
        direction.y = 0; // Bloquear inclinación vertical en el nodo raíz para mantener estabilidad

        if (direction.lengthSquared() > 0.001) {
            direction.normalize(); // Importante: la dirección debe estar normalizada para FromLookDirectionLH

            // CORRECCIÓN: Usamos el método nativo oficial de BabylonJS
            const targetRotation = Quaternion.FromLookDirectionLH(direction, Vector3.UpReadOnly);

            // Inicializar el cuaternión del root si viene nulo por defecto (evita bugs de desborde)
            if (!this.root.rotationQuaternion) {
                this.root.rotationQuaternion = Quaternion.Identity();
            }

            // Interpolar la rotación actual del root hacia el objetivo (Slerp) de forma fluida
            Quaternion.SlerpToRef(
                this.root.rotationQuaternion,
                targetRotation,
                0.1, // Factor de suavizado (cambiar para rotación más rápida o lenta)
                this.root.rotationQuaternion
            );
        }
    }

    /** 
     * Aplica el desplazamiento físico y las rotaciones cinemáticas frame a frame.
     * Debe llamarse rigurosamente al final del onThink del Drone.
     */
    public update(deltaTime: number): void {
        if (!this.isMoving) return;

        const currentPos = this.root.position;
        const distanceToTarget = Vector3.Distance(currentPos, this.targetPosition);

        // Distancia mínima para considerar que el drone llegó al destino
        const arrivalThreshold = 0.2;

        if (distanceToTarget <= arrivalThreshold) {
            this.isMoving = false;
            return;
        }

        // 1. GESTIÓN DE ROTACIÓN: Orientar el drone hacia donde está viajando
        this.lookAt(this.targetPosition);

        // 2. GESTIÓN DE TRASLACIÓN: Avanzar en línea recta hacia el objetivo
        const moveDir = this.targetPosition.subtract(currentPos).normalize();
        const currentFrameSpeed = this.baseSpeed * this.speedMultiplier * deltaTime;

        // Evitar sobrepasar el punto exacto de destino en este frame
        const distanceToStep = Math.min(currentFrameSpeed, distanceToTarget);
        this.root.position.addInPlace(moveDir.scale(distanceToStep));

        // 3. EFECTO VISUAL COSMÉTICO: Simular balanceo o inclinación leve de hélice (Opcional)
        // Se aplica sobre el nodo 'visual' para no alterar las colisiones o el forward real del 'root'
        if (this.visual) {
            this.visual.rotation.z = Math.sin(currentPos.x * 2) * 0.05; // Leve cabeceo lateral orgánico
        }
    }
}
