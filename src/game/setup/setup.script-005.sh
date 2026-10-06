#!/usr/bin/env bash
# setup.script-005 — Set de animaciones del personaje, data-driven.
# Ejecutar parado en /src:   bash game/setup/setup.script-005.sh
#
# Qué hace:
#   - assets/animations/character-clip-names.ts : UNA tabla clave -> nombre del clip en el GLB
#     (47 clips). De ahí salen el tipo CharacterAnimationSet, la búsqueda y el clonado.
#   - assets/animations/character-animation-set-factory.ts : createCharacterAnimationSet
#     (busca, activa blending, para todo; si faltan clips falla con la lista completa),
#     cloneCharacterAnimationSet (remapea con un índice por nombre armado una sola vez) y
#     disposeCharacterAnimationSet.
#   - AssetRegistry: getCharacterAnimations() (compartido) y getCharacterInstance(prefix)
#     (malla clonada + animaciones clonadas, con dispose()).
#   - AssetLoader: arma el molde al terminar de cargar; si faltan clips, la carga falla y el
#     mensaje aparece en la pantalla de carga.
#   - Corrige el typo "aimming" -> "aiming" en 5 claves.
#   - Actualiza 2 archivos entregados por 003/004 SOLO si no los editaste.
set -euo pipefail

if [[ "$(basename "$PWD")" != "src" ]]; then
  echo "Error: ejecutá este script parado en la carpeta src (actual: $PWD)" >&2
  exit 1
fi

BOOT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ ! -f "$BOOT_DIR/_lib.sh" ]]; then
  echo "Error: falta $BOOT_DIR/_lib.sh (lo crea setup.script-001.sh)" >&2
  exit 1
fi
# shellcheck source=_lib.sh
source "$BOOT_DIR/_lib.sh"

setup_begin "$0"
setup_requires "setup.script-004.sh"

echo "-- archivos nuevos"

write_file "game/assets/animations/character-clip-names.ts" <<'EOF'
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";

/**
 * Clave semántica -> nombre EXACTO del clip en el GLB del personaje.
 * Es la única fuente de verdad: de acá se derivan el tipo, la búsqueda y el clonado.
 *
 * Los nombres de clave vienen del POC (varios atados al contexto de patineta: cruising_*).
 * Se mantienen para no tocar dos cosas a la vez; renombrarlos queda como tarea aparte.
 * Único cambio respecto al POC: se corrigió el typo "aimming" -> "aiming".
 */
export const CHARACTER_CLIP_NAMES = {
  // Parado / patineta
  standing_idle: "standing idle",
  cruising_idle: "skateboarding",
  cruising_forward_idle: "skate_idle",
  cruising_faster_idle: "ninja crouch idle mirror",
  cruising_maxVel_idle: "skate crouching idle",
  standing_to_crouch: "skate standing to crouch",
  crouch_to_standing: "skate crouch to standing",

  // Saltos y aterrizajes
  jump: "jump in place2",
  jump_while_running: "jump while running",
  jump_on_board: "jump on board",
  normal_landing: "skate falling to landing",
  crash_landing: "flat crash",
  roll_landing: "landing to roll",
  running_roll: "roll to run",

  // Aire / jetpack
  floating: "floating",
  flying: "flying",
  falling_idle: "falling idle",
  aiming_jetpack: "aiming in the air",

  // A pie
  walking_forward: "walking forward",
  walking_backwards: "walking backwards",
  running_normal: "standard run",
  running_fast: "running fast",
  strafe_right: "strafe left", // invertidos a propósito: los clips del GLB vienen espejados
  strafe_left: "strafe right",
  crouch_walk: "crouched walk",
  crouch_walkbackwards: "crouched walk backwards",

  // Apuntando
  idle_aiming: "idle aim",
  walking_aiming: "walking aim",
  walking_backwards_aiming: "walking back aim",
  running_aiming: "running aim",
  crouch_aiming: "crouch aim",
  crouch_idle_aim: "crouch aim", // mismo clip que crouch_aiming: probable duplicado, a revisar
  crouch_walk_aim: "crouched walk aiming",
  crouch_walkbackwards_aim: "crouched walk aim backwards",

  // Escudo
  shield_idle: "shield idle",
  shield_idle_crouched: "shield crouched idle",
  shield_strafe_left: "shield strafe left",
  shield_strafe_right: "shield strafe right",
  shield_walk_forward: "shield walking forward",
  shield_walk_backwards: "shield walking backwards",

  // Daño y muerte
  hit_reaction_crouched: "hit reaction crouched",
  hit_reaction_standing: "hit reaction standing",
  death_crouched: "death from crouched",
  death_standing: "death from standing",
  death_hoverBoard: "death from hoverBoard",
  death_onAir: "death from jetpack",
  death_onAir_landing: "landing from onair death",
} as const;

export type CharacterClipKey = keyof typeof CHARACTER_CLIP_NAMES;

/** Diccionario semántico de animaciones del personaje: una AnimationGroup por clave. */
export type CharacterAnimationSet = Record<CharacterClipKey, AnimationGroup>;

export const CHARACTER_CLIP_KEYS = Object.keys(CHARACTER_CLIP_NAMES) as CharacterClipKey[];
EOF

write_file "game/assets/animations/character-animation-set-factory.ts" <<'EOF'
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Node } from "@babylonjs/core/node";

import {
  CHARACTER_CLIP_KEYS,
  CHARACTER_CLIP_NAMES,
  type CharacterAnimationSet,
  type CharacterClipKey,
} from "./character-clip-names";

/** Velocidad de mezcla entre clips: más alto = transiciones más rápidas. */
const ANIMATION_BLENDING_SPEED = 0.1;

/**
 * Arma el molde semántico UNA sola vez a partir de los clips crudos del GLB:
 * busca cada clip por nombre exacto, activa el blending y deja todo parado.
 * Si faltan clips, falla con la lista completa (no uno por uno).
 */
export function createCharacterAnimationSet(groups: readonly AnimationGroup[]): CharacterAnimationSet {
  const byName = new Map<string, AnimationGroup>();
  for (const group of groups) {
    if (!byName.has(group.name)) {
      byName.set(group.name, group);
    }
  }

  const found: Partial<CharacterAnimationSet> = {};
  const missing: string[] = [];
  for (const key of CHARACTER_CLIP_KEYS) {
    const clipName = CHARACTER_CLIP_NAMES[key];
    const group = byName.get(clipName);
    if (group) {
      found[key] = group;
    } else {
      missing.push(`${key} ("${clipName}")`);
    }
  }
  if (missing.length > 0) {
    throw new Error(`[createCharacterAnimationSet] missing clips in the GLB: ${missing.join(", ")}`);
  }

  const set = found as CharacterAnimationSet;
  for (const key of CHARACTER_CLIP_KEYS) {
    set[key].enableBlending = true;
    set[key].blendingSpeed = ANIMATION_BLENDING_SPEED;
  }
  groups.forEach((group) => group.stop());
  return set;
}

/**
 * Clona cada clip del molde remapeando sus targets (huesos/nodos) a la copia `target`.
 * Los nombres quedan `${prefix}${nombre original}`.
 * Quien lo pide es dueño de los clones y debe llamar a disposeCharacterAnimationSet().
 */
export function cloneCharacterAnimationSet(
  source: CharacterAnimationSet,
  target: AbstractMesh,
  prefix = "",
): CharacterAnimationSet {
  // Índice por nombre armado UNA vez (el POC recorría la jerarquía por cada target de cada clip).
  const nodesByName = new Map<string, Node>();
  for (const mesh of target.getChildMeshes()) {
    nodesByName.set(mesh.name, mesh);
  }
  for (const node of target.getDescendants(false)) {
    if (!nodesByName.has(node.name)) {
      nodesByName.set(node.name, node);
    }
  }
  const retarget = (oldTarget: { name: string }): unknown => nodesByName.get(oldTarget.name) ?? oldTarget;

  const clones: Partial<CharacterAnimationSet> = {};
  for (const key of CHARACTER_CLIP_KEYS) {
    const original = source[key];
    const copy = original.clone(`${prefix}${original.name}`, retarget);
    copy.enableBlending = original.enableBlending;
    copy.blendingSpeed = original.blendingSpeed;
    clones[key] = copy;
  }
  return clones as CharacterAnimationSet;
}

export function disposeCharacterAnimationSet(set: CharacterAnimationSet): void {
  for (const key of Object.keys(set) as CharacterClipKey[]) {
    set[key].dispose();
  }
}
EOF

echo "-- archivos actualizados (solo si no los editaste)"

update_file "game/assets/asset-loader.ts" "2007158a84d1a10c761a84fab2f44a110f8bd02d312862832f5fcaaac7dc7566" <<'EOF'
import "@babylonjs/loaders/glTF"; // registra el loader de .glb/.gltf
import "@babylonjs/core/Animations/animatable"; // habilita reproducir AnimationGroup
import { AssetsManager } from "@babylonjs/core/Misc/assetsManager";
import type { Scene } from "@babylonjs/core/scene";

import { TypedEventEmitter } from "../core/events/typed-event-emitter";
import { gameConfig } from "../config/game-config";
import { createCharacterAnimationSet } from "./animations/character-animation-set-factory";
import type { AssetRegistry } from "./asset-registry";

const FLARE_TEXTURE_URL = "texture/flare.png";
const KEYMAP_IMAGE_URL = "images/keymap.jpg";
const CHARACTER_MODEL_ROOT_URL = "model/";
const CHARACTER_MODEL_FILE = "skater_ver15.glb";

/** Nombre del nodo raíz que el loader de glTF crea alrededor de cada GLB. */
const GLTF_ROOT_NODE_NAME = "__root__";

export interface AssetLoaderEventMap {
  progressChanged: { finishedTasks: number; totalTasks: number; fraction: number; lastTaskName: string };
  taskFailed: { taskName: string; message: string };
  loadCompleted: { durationMs: number };
}

/** Carga los assets comunes (estado 2) y los registra en el AssetRegistry. */
export class AssetLoader {
  readonly events = new TypedEventEmitter<AssetLoaderEventMap>();

  constructor(
    private readonly scene: Scene,
    private readonly registry: AssetRegistry,
  ) {}

  loadCommonAssets(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const startedAt = performance.now();
      const failures: string[] = [];

      const manager = new AssetsManager(this.scene);
      manager.useDefaultLoadingScreen = false; // la pantalla de carga es nuestra (HTML)

      const fail = (taskName: string, message: string): void => {
        failures.push(`${taskName}: ${message}`);
        this.events.emit("taskFailed", { taskName, message });
      };

      const textureTask = manager.addTextureTask("texture-flare", FLARE_TEXTURE_URL);
      textureTask.onSuccess = (task) => {
        this.registry.registerTexture("flare", task.texture);
      };
      textureTask.onError = (task, message) => fail(task.name, message ?? "unknown error");

      const keymapTask = manager.addImageTask("image-keymap", KEYMAP_IMAGE_URL);
      keymapTask.onSuccess = (task) => {
        this.registry.registerImage("keymap", task.image);
      };
      keymapTask.onError = (task, message) => fail(task.name, message ?? "unknown error");

      const modelTask = manager.addMeshTask("model-character", "", CHARACTER_MODEL_ROOT_URL, CHARACTER_MODEL_FILE);
      modelTask.onSuccess = (task) => {
        const root = task.loadedMeshes.find((mesh) => mesh.name === GLTF_ROOT_NODE_NAME);
        if (!root) {
          fail(task.name, `the GLB has no "${GLTF_ROOT_NODE_NAME}" node`);
          return;
        }
        root.setEnabled(false); // es un prototipo: no se ve hasta que alguien lo pida
        task.loadedAnimationGroups.forEach((group) => group.stop());
        this.registry.registerMesh("character-model", root, {
          skeleton: task.loadedSkeletons[0],
          animationGroups: task.loadedAnimationGroups,
        });
      };
      modelTask.onError = (task, message) => fail(task.name, message ?? "unknown error");

      manager.onProgress = (remainingCount, totalCount, lastFinishedTask) => {
        const finishedTasks = totalCount - remainingCount;
        this.events.emit("progressChanged", {
          finishedTasks,
          totalTasks: totalCount,
          fraction: totalCount === 0 ? 1 : finishedTasks / totalCount,
          lastTaskName: lastFinishedTask.name,
        });
      };

      manager.onFinish = () => {
        if (failures.length > 0) {
          reject(new Error(`[AssetLoader] failed to load: ${failures.join("; ")}`));
          return;
        }
        try {
          this.registry.registerCharacterAnimations(
            createCharacterAnimationSet(this.registry.getAnimationGroups("character-model")),
          );
          this.normalizeCharacterScale();
        } catch (error) {
          reject(error);
          return;
        }
        this.events.emit("loadCompleted", { durationMs: performance.now() - startedAt });
        resolve();
      };

      manager.load();
    });
  }

  dispose(): void {
    this.events.clear();
  }

  /** Escala el prototipo del personaje para que mida gameConfig.player.height. */
  private normalizeCharacterScale(): void {
    const root = this.registry.getMesh("character-model");
    root.computeWorldMatrix(true);
    const { min, max } = root.getHierarchyBoundingVectors(true); // true = incluye hijos
    const modelHeight = max.y - min.y;
    if (modelHeight <= 0) {
      throw new Error("[AssetLoader] character model has zero height; cannot normalize its scale");
    }
    root.scaling.setAll(gameConfig.player.height / modelHeight);
  }
}
EOF

update_file "game/assets/asset-registry.ts" "01416d82167a02fb8ce383f8e9b19ee5f2b4e2b08e950698708c30330692bbb8" <<'EOF'
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
EOF

setup_end