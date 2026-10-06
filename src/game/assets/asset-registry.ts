import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import {
  cloneCharacterAnimationSet,
  disposeCharacterAnimationSet,
} from "./animations/character-animation-set-factory";
import type { CharacterAnimationSet } from "./animations/character-clip-names";
import type { ImageAssetKey, MeshAssetKey, TextureAssetKey } from "./asset-keys";

export interface MeshAssetExtras {
  skeleton?: Skeleton;
  /** Clips crudos del GLB, tal cual vienen (parados). */
  animationGroups?: readonly AnimationGroup[];
}

/** Copia del personaje con sus animaciones remapeadas a ESA copia. Quien la pide debe llamar a dispose(). */
export interface CharacterInstance {
  readonly mesh: AbstractMesh;
  readonly animations: CharacterAnimationSet;
  dispose(): void;
}

/** Guarda los prototipos de los assets por clave y los entrega (compartidos o clonados). */
export class AssetRegistry {
  private readonly textures = new Map<TextureAssetKey, Texture>();
  private readonly images = new Map<ImageAssetKey, HTMLImageElement>();
  private readonly meshes = new Map<MeshAssetKey, AbstractMesh>();
  private readonly skeletons = new Map<MeshAssetKey, Skeleton>();
  private readonly animationGroups = new Map<MeshAssetKey, readonly AnimationGroup[]>();
  private characterAnimations: CharacterAnimationSet | null = null;

  registerTexture(key: TextureAssetKey, texture: Texture): void {
    this.textures.set(key, texture);
  }

  registerMesh(key: MeshAssetKey, mesh: AbstractMesh, extras: MeshAssetExtras = {}): void {
    this.meshes.set(key, mesh);
    if (extras.skeleton) {
      this.skeletons.set(key, extras.skeleton);
    }
    if (extras.animationGroups) {
      this.animationGroups.set(key, extras.animationGroups);
    }
  }

  registerImage(key: ImageAssetKey, image: HTMLImageElement): void {
    this.images.set(key, image);
  }

  registerCharacterAnimations(set: CharacterAnimationSet): void {
    this.characterAnimations = set;
  }

  getTexture(key: TextureAssetKey): Texture {
    return this.require(this.textures.get(key), "texture", key);
  }

  /** Imagen ya descargada y decodificable: lista para usar en pantallas HTML. */
  getImage(key: ImageAssetKey): HTMLImageElement {
    return this.require(this.images.get(key), "image", key);
  }

  /**
   * Por defecto NO clona: devuelve el prototipo compartido, sin efectos secundarios
   * (sigue deshabilitado; quien lo use directamente decide cuándo habilitarlo).
   *
   * Con `clone = true` devuelve una copia habilitada cuyo nombre es `${prefix}${nombre original}`.
   * Quien la pide es dueño de la copia y debe llamar a su dispose().
   */
  getMesh(key: MeshAssetKey, clone = false, prefix = ""): AbstractMesh {
    const prototype = this.require(this.meshes.get(key), "mesh", key);
    if (!clone) {
      return prototype;
    }
    const instance = prototype.clone(`${prefix}${prototype.name}`, null);
    if (!instance) {
      throw new Error(`[AssetRegistry] could not clone mesh "${key}"`);
    }
    instance.setEnabled(true);
    return instance;
  }

  getSkeleton(key: MeshAssetKey): Skeleton | undefined {
    return this.skeletons.get(key);
  }

  /** Clips crudos compartidos del GLB (no clonados). */
  getAnimationGroups(key: MeshAssetKey): readonly AnimationGroup[] {
    return this.animationGroups.get(key) ?? [];
  }

  /** Animaciones compartidas: sirven para el prototipo (getMesh sin clonar). */
  getCharacterAnimations(): CharacterAnimationSet {
    return this.require(this.characterAnimations ?? undefined, "animations", "character-model");
  }

  /**
   * Personaje clonado + animaciones clonadas y remapeadas a esa copia.
   * Hace falta un método propio porque clonar las animaciones requiere la malla destino.
   */
  getCharacterInstance(prefix = ""): CharacterInstance {
    const mesh = this.getMesh("character-model", true, prefix);
    const animations = cloneCharacterAnimationSet(this.getCharacterAnimations(), mesh, prefix);
    return {
      mesh,
      animations,
      dispose: () => {
        disposeCharacterAnimationSet(animations);
        mesh.dispose(false, false); // los materiales son del prototipo, no se liberan acá
      },
    };
  }

  dispose(): void {
    this.animationGroups.forEach((groups) => groups.forEach((group) => group.dispose()));
    this.skeletons.forEach((skeleton) => skeleton.dispose());
    this.meshes.forEach((mesh) => mesh.dispose(false, true));
    this.textures.forEach((texture) => texture.dispose());
    this.animationGroups.clear();
    this.skeletons.clear();
    this.meshes.clear();
    this.textures.clear();
    this.images.clear();
    this.characterAnimations = null; // sus clips son los mismos de animationGroups (ya liberados)
  }

  private require<T>(value: T | undefined, kind: string, key: string): T {
    if (value === undefined) {
      throw new Error(`[AssetRegistry] ${kind} "${key}" is not registered (was it loaded?)`);
    }
    return value;
  }
}
