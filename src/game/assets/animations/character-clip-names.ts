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
