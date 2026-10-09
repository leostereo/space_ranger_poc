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
