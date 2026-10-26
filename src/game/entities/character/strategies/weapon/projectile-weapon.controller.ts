import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { IWeaponController } from "../contracts/iweapon-controller";
import { EventManager, GameEvents } from "@/game/services/event-manager";
export interface ProjectileWeaponConfig {
    fireRate: number;
    damage: number; // daño por proyectil
    projectileSpeed: number;
    projectileLifetime: number;
    projectileRadius: number;
    projectileLength: number;
    poolSize: number;
    emissiveColor: Color3;
    muzzleFlashDuration: number;
    muzzleFlashScale: number;
    muzzleFlashColor: Color3;
    impactEffectDuration: number;
    impactEffectScale: number;
    impactEffectColor: Color3;
    impactPoolSize: number;
}

export interface ProjectileWeaponOptions {
    /** Identifica quién dispara; viaja en el evento de impacto. */
    sourceId?: string;
    /** Mallas que cuentan como blanco aunque no sean pickable (ej: el Character, que no lo es a propósito). */
    isExtraTarget?: (mesh: AbstractMesh) => boolean;
    /** Segundos que espera antes del primer disparo (para desfasar varias armas). Por defecto, 0. */
    initialDelaySeconds?: number;
    getEmitterVelocity?: () => Vector3;
}

export const DEFAULT_PROJECTILE_WEAPON_CONFIG: ProjectileWeaponConfig = {
    fireRate: 6,
    damage: 1,
    projectileSpeed: 100,
    projectileLifetime: 2,
    projectileRadius: 0.1,
    projectileLength: 0.65,
    poolSize: 20,
    emissiveColor: new Color3(1, 0.2, 0.2), // Un rojo más vibrante
    muzzleFlashDuration: 0.06,
    muzzleFlashScale: 0.25,                 // Fogonazo un poco más grande
    muzzleFlashColor: new Color3(1, 0.95, 0.6),
    impactEffectDuration: 0.15,
    impactEffectScale: 0.35,                 // Chispas del impacto más visibles al chocar
    impactEffectColor: new Color3(1, 0.6, 0.15),
    impactPoolSize: 6,
};

const PARK_POSITION = new Vector3(0, -5000, 0);

interface PoolEntry {
    mesh: Mesh;
    isActive: boolean;
    direction: Vector3;
    elapsed: number;
    customSpeed: number; // 👈 Esta es la propiedad que nos faltaba declarar
}

interface ImpactEntry {
    mesh: Mesh;
    elapsed: number; // Infinity = inactivo
}

export class ProjectileWeaponController implements IWeaponController {
    private pool: PoolEntry[] = [];
    private cooldownElapsed: number;
    private fireInterval: number;
    private _ray = new Ray(Vector3.Zero(), Vector3.Forward(), 1);
    private flashMesh: Mesh;
    private flashElapsed = Infinity; // Infinity = inactivo, evita un flag isActive extra
    private impactPool: ImpactEntry[] = [];

    constructor(
        private scene: Scene,
        private muzzle: TransformNode,
        private shouldFire: () => boolean,
        private excludeMeshes: AbstractMesh[],
        private config: ProjectileWeaponConfig = DEFAULT_PROJECTILE_WEAPON_CONFIG,
        private options: ProjectileWeaponOptions = {},
    ) {
        this.fireInterval = 1 / this.config.fireRate;
        // Arranca listo para disparar de entrada, salvo que se pida un retraso inicial.
        this.cooldownElapsed = this.fireInterval - (this.options.initialDelaySeconds ?? 0);
        this._buildPool();
        this._buildFlash();
        this._buildImpactPool();
    }

    private _buildPool(): void {
        const material = new StandardMaterial("projectileMat", this.scene);

        // 🟢 CONFIGURACIÓN DE ENERGÍA Y LUMINOSIDAD
        material.diffuseColor = Color3.Black(); // No reacciona a las luces ambientales del mapa
        material.emissiveColor = this.config.emissiveColor; // Brilla con su propio color
        material.specularColor = Color3.Black(); // Sin reflejos de brillo plásticos

        // 🟢 TRASLUCIDEZ ADITIVA: El secreto para que parezca plasma/láser
        // Al superponerse con el fondo o con enemigos, sumará los canales de color dando sensación de incandescencia.
        material.alpha = 0.9;
        material.alphaMode = 1; // Engine.ALPHA_ADD (Suma de luces, ideal para láseres y fuegos)

        for (let i = 0; i < this.config.poolSize; i++) {
            const mesh = MeshBuilder.CreateCylinder(
                `projectile_${i}`,
                { diameter: this.config.projectileRadius * 2, height: this.config.projectileLength, tessellation: 8 },
                this.scene,
            );
            mesh.material = material;
            mesh.position.copyFrom(PARK_POSITION);
            mesh.isPickable = false;

            // 🟢 INICIALIZA LA PROPIEDAD AQUÍ CON UN VALOR POR DEFECTO:
            this.pool.push({
                mesh,
                isActive: false,
                direction: Vector3.Zero(),
                elapsed: 0,
                customSpeed: 0 // 👈 Sumamos esto para cumplir con la interfaz
            });
        }
    }

    private _buildFlash(): void {
        const material = new StandardMaterial("muzzleFlashMat", this.scene);
        material.diffuseColor = Color3.Black();
        material.emissiveColor = this.config.muzzleFlashColor;
        material.specularColor = Color3.Black();
        material.alpha = 0.85;
        material.alphaMode = 1; // 🟢 Fogonazo aditivo brillante

        this.flashMesh = MeshBuilder.CreateSphere("muzzleFlash", { diameter: 1, segments: 6 }, this.scene);
        this.flashMesh.material = material;
        this.flashMesh.isPickable = false;
        this.flashMesh.parent = this.muzzle;
        this.flashMesh.position.setAll(0);
        this.flashMesh.scaling.setAll(0);
        this.flashMesh.setEnabled(false);
    }

    private _buildImpactPool(): void {
        const material = new StandardMaterial("impactEffectMat", this.scene);
        material.diffuseColor = Color3.Black();
        material.emissiveColor = this.config.impactEffectColor;
        material.specularColor = Color3.Black();
        material.alpha = 0.9;
        material.alphaMode = 1; // 🟢 Chispazo aditivo brillante al impactar

        for (let i = 0; i < this.config.impactPoolSize; i++) {
            const mesh = MeshBuilder.CreateSphere(`impactEffect_${i}`, { diameter: 1, segments: 6 }, this.scene);
            material.disableLighting = true; // Optimización: no calcula luces para efectos efímeros
            mesh.material = material;
            mesh.isPickable = false;
            mesh.scaling.setAll(0);
            mesh.setEnabled(false);
            this.impactPool.push({ mesh, elapsed: Infinity });
        }
    }


    private _triggerImpact(position: Vector3): void {
        const free = this.impactPool.find((entry) => entry.elapsed === Infinity);
        if (!free) return; // pool de impactos agotado — se pierde el efecto visual, no el gameplay

        free.mesh.position.copyFrom(position);
        free.mesh.scaling.setAll(this.config.impactEffectScale);
        free.mesh.setEnabled(true);
        free.elapsed = 0;
    }

    private _tickImpacts(dt: number): void {
        for (const entry of this.impactPool) {
            if (entry.elapsed === Infinity) continue;

            entry.elapsed += dt;
            const t = Math.min(entry.elapsed / this.config.impactEffectDuration, 1);
            entry.mesh.scaling.setAll(this.config.impactEffectScale * (1 - t));

            if (t >= 1) {
                entry.mesh.setEnabled(false);
                entry.elapsed = Infinity;
            }
        }
    }

    tick(dt: number): void {
        this._tickCooldownAndFire(dt);
        this._tickActiveProjectiles(dt);
        this._tickFlash(dt);
        this._tickImpacts(dt);
    }

    private _tickFlash(dt: number): void {
        if (this.flashElapsed === Infinity) return;

        this.flashElapsed += dt;
        const t = Math.min(this.flashElapsed / this.config.muzzleFlashDuration, 1);
        const currentScale = this.config.muzzleFlashScale * (1 - t); // decae linealmente a 0

        this.flashMesh.scaling.setAll(currentScale);

        if (t >= 1) {
            this.flashMesh.setEnabled(false);
            this.flashElapsed = Infinity;
        }
    }

    private _tickCooldownAndFire(dt: number): void {
        this.cooldownElapsed += dt;
        if (!this.shouldFire()) return;
        if (this.cooldownElapsed < this.fireInterval) return;

        this.cooldownElapsed = 0;

        // 🟢 OPTIMIZACIÓN CENTRAL: Solicitamos la velocidad SOLO en el frame del disparo
        const emitterVel = this.options.getEmitterVelocity ? this.options.getEmitterVelocity() : Vector3.Zero();
        this._fireOne(emitterVel);
    }

    private _fireOne(emitterVelocity: Vector3): void {
        const free = this.pool.find((entry) => !entry.isActive);
        if (!free) return;

        const origin = this.muzzle.getAbsolutePosition();
        const direction = Vector3.TransformNormal(Vector3.Forward(), this.muzzle.getWorldMatrix()).normalize();

        free.mesh.position.copyFrom(origin);
        free.direction.copyFrom(direction);
        free.mesh.lookAt(origin.add(direction), 0, Math.PI / 2);
        free.elapsed = 0;
        free.isActive = true;
        free.mesh.setEnabled(true);

        // 🟢 FÍSICA RELATIVISTA BAJO DEMANDA:
        // Proyectamos la inercia lineal del vehículo sobre el vector frontal de la bala
        const forwardInertia = Vector3.Dot(emitterVelocity, direction);

        // Evitamos velocidades negativas si el vehículo frena de golpe o va marcha atrás
        const addedSpeed = Math.max(0, forwardInertia);

        // Asignamos la velocidad combinada final única para esta entidad bala
        free.customSpeed = this.config.projectileSpeed + addedSpeed;

        this._triggerFlash();
    }

    private _triggerFlash(): void {
        this.flashElapsed = 0;
        this.flashMesh.setEnabled(true);
        this.flashMesh.scaling.setAll(this.config.muzzleFlashScale);
    }

    private _tickActiveProjectiles(dt: number): void {
        for (const entry of this.pool) {
            if (!entry.isActive) continue;

            entry.elapsed += dt;
            if (entry.elapsed >= this.config.projectileLifetime) {
                this._deactivate(entry);
                continue;
            }

            // 🟢 MOVIMIENTO SUAVIZADO: Usamos la velocidad calculada al nacer la bala
            const step = entry.direction.scale(entry.customSpeed * dt);
            const stepLength = step.length();

            this._ray.origin.copyFrom(entry.mesh.position);
            this._ray.direction.copyFrom(entry.direction);
            this._ray.length = stepLength;

            const hit = this.scene.pickWithRay(
                this._ray,
                (mesh) =>
                    !this.excludeMeshes.includes(mesh) &&
                    (mesh.isPickable || (this.options.isExtraTarget?.(mesh) ?? false)),
            );

            if (hit?.hit) {
                const point = hit.pickedPoint ?? entry.mesh.position;
                this._triggerImpact(point);
                if (hit.pickedMesh) {
                    EventManager.emit(GameEvents.ProjectileHit, {
                        mesh: hit.pickedMesh,
                        point: point.clone(),
                        direction: entry.direction.clone(),
                        damage: this.config.damage,
                        sourceId: this.options.sourceId,
                    });
                }
                this._deactivate(entry);
                continue;
            }

            entry.mesh.position.addInPlace(step);
        }
    }

    private _deactivate(entry: PoolEntry): void {
        entry.isActive = false;
        entry.mesh.setEnabled(false);
        entry.mesh.position.copyFrom(PARK_POSITION);
    }

    dispose(): void {
        // true: libera también el material (cada grupo comparte uno propio de este controller)
        this.pool.forEach((entry) => entry.mesh.dispose(false, true));
        this.flashMesh.dispose(false, true);
        this.impactPool.forEach((entry) => entry.mesh.dispose(false, true));
    }
}