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
  // {
  //   id: "poc2-board_transition",
  //   label: "POC 2 · Board Transition",
  //   load: () => import("./poc2-board_transition/poc2-board-transition"),
  // },
];