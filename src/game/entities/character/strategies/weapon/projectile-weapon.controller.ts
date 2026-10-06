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

export interface ProjectileWeaponConfig {
    fireRate: number;
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

export const DEFAULT_PROJECTILE_WEAPON_CONFIG: ProjectileWeaponConfig = {
    fireRate: 6,
    projectileSpeed: 60,
    projectileLifetime: 2,
    projectileRadius: 0.02,
    projectileLength: 0.2,
    poolSize: 20,
    emissiveColor: new Color3(1, 0.05, 0.05),
    muzzleFlashDuration: 0.06,
    muzzleFlashScale: 0.18,
    muzzleFlashColor: new Color3(1, 0.95, 0.6),
    impactEffectDuration: 0.15,
    impactEffectScale: 0.22,
    impactEffectColor: new Color3(1, 0.6, 0.15), // naranja/chispa — distinto del rojo del proyectil, se lee como "impacto"
    impactPoolSize: 6,
};

const PARK_POSITION = new Vector3(0, -5000, 0);

interface PoolEntry {
    mesh: Mesh;
    isActive: boolean;
    direction: Vector3;
    elapsed: number;
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
    ) {
        this.fireInterval = 1 / this.config.fireRate;
        this.cooldownElapsed = this.fireInterval; // arranca listo para disparar de entrada
        this._buildPool();
        this._buildFlash();
        this._buildImpactPool();
    }

    private _buildPool(): void {
        const material = new StandardMaterial("projectileMat", this.scene);
        material.diffuseColor = this.config.emissiveColor.scale(0.05);
        material.emissiveColor = this.config.emissiveColor;
        material.specularColor = Color3.Black();

        for (let i = 0; i < this.config.poolSize; i++) {
            const mesh = MeshBuilder.CreateCylinder(
                `projectile_${i}`,
                { diameter: this.config.projectileRadius * 2, height: this.config.projectileLength, tessellation: 8 },
                this.scene,
            );
            mesh.rotation.x = Math.PI / 2;
            mesh.material = material;
            mesh.position.copyFrom(PARK_POSITION);
            mesh.isPickable = false;

            this.pool.push({ mesh, isActive: false, direction: Vector3.Zero(), elapsed: 0 });
        }
    }

    private _buildFlash(): void {
        const material = new StandardMaterial("muzzleFlashMat", this.scene);
        material.diffuseColor = Color3.Black();
        material.emissiveColor = this.config.muzzleFlashColor;
        material.specularColor = Color3.Black();

        this.flashMesh = MeshBuilder.CreateSphere("muzzleFlash", { diameter: 1, segments: 6 }, this.scene);
        this.flashMesh.material = material;
        this.flashMesh.isPickable = false;
        this.flashMesh.parent = this.muzzle; // hereda posición Y orientación del muzzle automáticamente
        this.flashMesh.position.setAll(0);
        this.flashMesh.scaling.setAll(0);
        this.flashMesh.setEnabled(false);
    }

    private _buildImpactPool(): void {
        const material = new StandardMaterial("impactEffectMat", this.scene);
        material.diffuseColor = Color3.Black();
        material.emissiveColor = this.config.impactEffectColor;
        material.specularColor = Color3.Black();

        for (let i = 0; i < this.config.impactPoolSize; i++) {
            const mesh = MeshBuilder.CreateSphere(`impactEffect_${i}`, { diameter: 1, segments: 6 }, this.scene);
            mesh.material = material;
            mesh.isPickable = false; // el propio efecto no debe ser blanco de otros raycasts
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
        this._fireOne();
    }

    private _fireOne(): void {
        const free = this.pool.find((entry) => !entry.isActive);
        if (!free) return;

        const origin = this.muzzle.getAbsolutePosition();
        const direction = Vector3.TransformNormal(Vector3.Forward(), this.muzzle.getWorldMatrix()).normalize();

        free.mesh.position.copyFrom(origin);
        free.direction.copyFrom(direction);
        free.mesh.lookAt(origin.add(direction));
        free.elapsed = 0;
        free.isActive = true;
        free.mesh.setEnabled(true);

        this._triggerFlash(); // NUEVO
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

            const step = entry.direction.scale(this.config.projectileSpeed * dt);
            const stepLength = step.length();

            this._ray.origin.copyFrom(entry.mesh.position);
            this._ray.direction.copyFrom(entry.direction);
            this._ray.length = stepLength;

            const hit = this.scene.pickWithRay(
                this._ray,
                (mesh) => mesh.isPickable && !this.excludeMeshes.includes(mesh),
            );

            if (hit?.hit) {
                // TODO: placeholder — acá eventualmente un Observable<HitInfo> propio.
                console.log(`${entry.mesh.name} impactó contra`, hit.pickedMesh?.name);
                this._triggerImpact(hit.pickedPoint ?? entry.mesh.position); // NUEVO — fallback por si pickedPoint viene null
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
        this.pool.forEach((entry) => entry.mesh.dispose());
        this.flashMesh.dispose();
        this.impactPool.forEach((entry) => entry.mesh.dispose()); // NUEVO
    }
}