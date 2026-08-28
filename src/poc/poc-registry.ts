import { PocDefinition } from "./types";

/**
 * Cada nuevo POC se agrega acá. El import dinámico evita cargar
 * el código de todos los POCs de una: solo se trae el seleccionado.
 */
export const pocRegistry: PocDefinition[] = [
  {
    id: "poc1-floating_board",
    label: "POC 1 · Floating Board",
    description: "Efecto visual + controller de física de la patineta flotante.",
    load: () => import("./poc1-floating_board/poc1-floating-board.main"),
  },
  {
    id: "poc2-board_fsm",
    label: "POC 2 · Board FSM",
    description: "Aplica una fsm anidad al board obtenido en poc1.",
    load: () => import("./poc2-floating_board_fsm/board.main"),
  },
  {
    id: "poc3-character-jetPack",
    label: "POC 3 · Character JetPack",
    description: "Create jetpack for character",
    load: () => import("./poc3-jetpack_character_fsm/character.base"),
  },
  {
    id: "poc3-character-jetPackKKKK",
    label: "POC 4 · Character JetPack and hoverBoard",
    description: "Integrate character , jetcp and hoverBoard",
    load: () => import("./poc3-jetpack_character_fsm copy/character.base"),
  },
];