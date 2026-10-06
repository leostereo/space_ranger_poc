#!/usr/bin/env bash
# setup.script-002 — Nuevo comienzo: TODO el código nuevo vive bajo src/game.
# Ejecutar parado en /src:   bash game/setup/setup.script-002.sh
#
# Regla: no se modifica nada fuera de src/game que no sea una huella de 001.
# (001 creó carpetas en la raíz de src; este script las limpia.)
#
# Qué hace:
#   1. Limpia lo que 001 dejó FUERA de game/. Un archivo solo se borra si es idéntico
#      (por hash) a lo que entregó 001. Si es distinto es tuyo o del código existente
#      y NO se toca. Los <archivo>.new de 001 eran copias nuestras: se borran.
#   2. Mueve el contenido actual de src/game (salvo setup/) a game/setup/backup-002/.
#   3. Crea la estructura y los archivos base nuevos, todos bajo src/game.
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
setup_requires "setup.script-001.sh"

hash_of() {
  if command -v sha256sum > /dev/null 2>&1; then
    tr -d '\r' < "$1" | sha256sum | cut -d' ' -f1
  else
    tr -d '\r' < "$1" | shasum -a 256 | cut -d' ' -f1
  fi
}

# Borra $1 solo si es idéntico a la versión que entregó 001 ($2 = sha256).
remove_if_ours() {
  local path="$1" sha="$2"
  if [[ -e "$path.new" ]]; then
    rm -f "$path.new"
    echo "CLEAN    $path.new (copia nuestra de 001)"
    if [[ -e "$path" ]]; then
      echo "KEEP     $path (ya existía antes: no es nuestro)"
    fi
    return 0
  fi
  if [[ -f "$path" ]]; then
    if [[ "$(hash_of "$path")" == "$sha" ]]; then
      rm -f "$path"
      echo "CLEAN    $path"
    else
      echo "KEEP     $path (distinto a lo que entregó 001: no se toca)"
    fi
  fi
}

# Carpeta hoja de 001: si solo tiene .gitkeep, lo borra; luego rmdir (solo si queda vacía).
drop_leaf_dir() {
  local dir="$1"
  [[ -d "$dir" ]] || return 0
  if [[ "$(ls -A "$dir")" == ".gitkeep" ]]; then
    rm -f "$dir/.gitkeep"
  fi
  if rmdir "$dir" 2> /dev/null; then
    echo "RMDIR    $dir"
  fi
}

drop_if_empty() {
  local dir="$1"
  if [[ -d "$dir" ]] && rmdir "$dir" 2> /dev/null; then
    echo "RMDIR    $dir"
  fi
}

# ---------------------------------------------------------------- 1. Limpieza de la huella de 001
echo "-- limpieza de la huella de 001 fuera de game/"
while read -r path sha; do
  [[ -n "$path" ]] || continue
  remove_if_ours "$path" "$sha"
done <<'ROOT_FILES'
core/events/typed-event-emitter.ts f89b1ccd3aa5a11d43b101a9875d08083ddaf1cc3404892665082e700b8e0071
core/input/any-input-service.ts c1ff1d3f4a7a4aa7f03675c0991154cf0070b425b4176d77ff566ea10f86a44d
ui/screens/game-screen.ts 5a43b93237e5489e1ce2f66ef93edcfa2cd12bad2c9f65b656f9bd713fe2da83
ui/screens/html-screen.ts 923be492bcf5af57984dbc29fc0517233978905145b715e89d66332e25ad2ba4
ui/screens/screen-manager.ts 6e3d6d24d7b026945e8d899c0a6df58cedbb3f0577621314ff4c49d3c74f59a5
ui/screens/screens.css 56c9e2b3390c1c12181bb2d3ee2504f6bef7c6b66ebcdd143b6a3c8e65137580
debug/debug-hud.ts bd07f9decc2fa7494112a50a5f41b7b7131561bac173e99c28722a32d1e25328
debug/attach-game-debug-hud.ts c743ac3ff4a9a4826e3cb768abe7b2231481d88e31d85ff856b45bb1688535cf
ROOT_FILES

for dir in levels/definitions levels/strategies \
  entities/character/locomotion/on-foot entities/character/locomotion/skateboard \
  entities/character/locomotion/hoverboard entities/enemies/drones ui/hud; do
  drop_leaf_dir "$dir"
done
for dir in entities/character/locomotion entities/character entities/enemies entities levels \
  core/events core/input core ui/screens ui debug; do
  drop_if_empty "$dir"
done

# ---------------------------------------------------------------- 2. Reinicio de src/game (con backup)
echo "-- backup del contenido actual de game/ (salvo setup/)"
BACKUP="game/setup/backup-002"
for entry in game/*; do
  [[ -e "$entry" ]] || continue
  [[ "$entry" == "game/setup" ]] && continue
  mkdir -p "$BACKUP"
  mv "$entry" "$BACKUP/"
  echo "BACKUP   $entry -> $BACKUP/"
done

# ---------------------------------------------------------------- 3. Estructura nueva (todo bajo game/)
echo "-- estructura"
keep_dir game/config
keep_dir game/levels/definitions
keep_dir game/levels/strategies
keep_dir game/entities/character/locomotion/on-foot
keep_dir game/entities/character/locomotion/skateboard
keep_dir game/entities/character/locomotion/hoverboard
keep_dir game/entities/enemies/drones
keep_dir game/services
keep_dir game/ui/hud

echo "-- archivos"

write_file "game/core/events/typed-event-emitter.ts" <<'EOF'
type Listener<TPayload> = (payload: TPayload) => void;

/**
 * Emisor de eventos tipado por mapa de eventos (nombre -> payload).
 * No depende de Babylon ni del DOM. Un listener que lanza no rompe a los demás.
 */
export class TypedEventEmitter<TEventMap extends object> {
  private readonly listeners: { [K in keyof TEventMap]?: Set<Listener<TEventMap[K]>> } = {};

  /** Suscribe un listener. Devuelve la función para desuscribirlo. */
  on<K extends keyof TEventMap>(event: K, listener: Listener<TEventMap[K]>): () => void {
    const set = (this.listeners[event] ??= new Set());
    set.add(listener);
    return () => this.off(event, listener);
  }

  off<K extends keyof TEventMap>(event: K, listener: Listener<TEventMap[K]>): void {
    this.listeners[event]?.delete(listener);
  }

  emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void {
    const set = this.listeners[event];
    if (!set) {
      return;
    }
    for (const listener of [...set]) {
      try {
        listener(payload);
      } catch (error) {
        console.error(`[TypedEventEmitter] listener failed for "${String(event)}"`, error);
      }
    }
  }

  /** Quita todos los listeners (usar en dispose del dueño del emisor). */
  clear(): void {
    for (const key of Object.keys(this.listeners) as (keyof TEventMap)[]) {
      delete this.listeners[key];
    }
  }
}
EOF

write_file "game/core/input/any-input-service.ts" <<'EOF'
type InputListener = () => void;

/**
 * Servicio global para "press any key": notifica la próxima entrada del jugador
 * (tecla o toque/click). Es de un solo uso por suscripción.
 *
 * No es un controller: no maneja entidades. El input del personaje va aparte.
 */
export class AnyInputService {
  private readonly pending = new Set<InputListener>();

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return; // mantener apretada una tecla no cuenta
    }
    // Ignora modificadores y atajos (ej: el atajo del Inspector Shift+Ctrl+Alt+I)
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    if (event.key === "Shift" || event.key === "Control" || event.key === "Alt" || event.key === "Meta") {
      return;
    }
    this.flush();
  };

  private readonly handlePointerDown = (): void => {
    this.flush();
  };

  constructor(private readonly target: Window = window) {
    this.target.addEventListener("keydown", this.handleKeyDown);
    this.target.addEventListener("pointerdown", this.handlePointerDown);
  }

  /** Ejecuta `listener` en la próxima entrada. Devuelve la función para cancelar. */
  onNextInput(listener: InputListener): () => void {
    this.pending.add(listener);
    return () => {
      this.pending.delete(listener);
    };
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.handleKeyDown);
    this.target.removeEventListener("pointerdown", this.handlePointerDown);
    this.pending.clear();
  }

  private flush(): void {
    // Snapshot + clear: lo que se suscriba durante el flush (ej: el estado siguiente)
    // espera a una entrada NUEVA, así una misma pulsación no encadena transiciones.
    const listeners = [...this.pending];
    this.pending.clear();
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        console.error("[AnyInputService] listener failed", error);
      }
    }
  }
}
EOF

write_file "game/debug/attach-game-debug-hud.ts" <<'EOF'
import { DebugHud } from "./debug-hud";
import type { TypedEventEmitter } from "../core/events/typed-event-emitter";
import type { GameFsmEventMap } from "../fsm/game-fsm-events";

const formatTime = (at: number): string => `[${(at / 1000).toFixed(2)}s]`;

/** Conecta los eventos de la GameFsm con el DebugHud. Devuelve la función para desconectar. */
export function attachGameDebugHud(events: TypedEventEmitter<GameFsmEventMap>): () => void {
  const hud = new DebugHud();
  hud.setValue("fsm.state", "-");
  hud.setValue("fsm.target", "-");

  const unsubscribers = [
    events.on("transitionStarted", ({ from, to, at }) => {
      hud.setValue("fsm.target", to);
      hud.log(`${formatTime(at)} start  ${from ?? "(none)"} -> ${to}`);
    }),
    events.on("stateExited", ({ id, at }) => {
      hud.setValue("fsm.state", "-");
      hud.log(`${formatTime(at)} exit   ${id}`);
    }),
    events.on("stateEntered", ({ id, enterDurationMs, at }) => {
      hud.setValue("fsm.state", id);
      hud.log(`${formatTime(at)} enter  ${id} (${enterDurationMs.toFixed(0)} ms)`);
    }),
    events.on("transitionCancelled", ({ to, reason, at }) => {
      hud.log(`${formatTime(at)} cancel ${to} (${reason})`);
    }),
    events.on("transitionFailed", ({ to, error, at }) => {
      hud.log(`${formatTime(at)} FAIL   ${to}: ${String(error)}`);
    }),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    hud.dispose();
  };
}
EOF

write_file "game/debug/debug-hud.ts" <<'EOF'
/**
 * HUD de debug (DOM, arriba a la derecha). Solo debe instanciarse en DEV.
 * Tiene valores clave/valor y un log circular. Renderiza como máximo una vez por frame.
 */
export class DebugHud {
  private readonly root: HTMLDivElement;
  private readonly values = new Map<string, string>();
  private readonly logLines: string[] = [];
  private renderScheduled = false;

  constructor(private readonly maxLogLines = 12) {
    this.root = document.createElement("div");
    this.root.id = "debug-hud";
    Object.assign(this.root.style, {
      position: "fixed",
      top: "8px",
      right: "8px",
      zIndex: "1000",
      minWidth: "260px",
      maxWidth: "40vw",
      padding: "6px 8px",
      background: "rgba(0, 0, 0, 0.65)",
      color: "#7CFC7C",
      font: "12px/1.4 monospace",
      whiteSpace: "pre",
      overflow: "hidden",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.root);
  }

  setValue(key: string, value: string): void {
    this.values.set(key, value);
    this.scheduleRender();
  }

  log(message: string): void {
    this.logLines.push(message);
    if (this.logLines.length > this.maxLogLines) {
      this.logLines.shift();
    }
    this.scheduleRender();
  }

  dispose(): void {
    this.root.remove();
    this.values.clear();
    this.logLines.length = 0;
  }

  private scheduleRender(): void {
    if (this.renderScheduled) {
      return;
    }
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this.renderScheduled = false;
      const valueLines = [...this.values].map(([key, value]) => `${key}: ${value}`);
      this.root.textContent = [...valueLines, "-----", ...this.logLines].join("\n");
    });
  }
}
EOF

write_file "game/fsm/game-fsm-events.ts" <<'EOF'
import type { GameStateId } from "./game-state";

/** Eventos de ciclo de vida de la GameFsm (hoy se usan para debug). */
export interface GameFsmEventMap {
  transitionStarted: { from: GameStateId | null; to: GameStateId; at: number };
  stateExited: { id: GameStateId; at: number };
  stateEntered: { id: GameStateId; enterDurationMs: number; at: number };
  transitionCancelled: { to: GameStateId; reason: "superseded"; at: number };
  transitionFailed: { to: GameStateId; error: unknown; at: number };
}
EOF

write_file "game/fsm/game-fsm.ts" <<'EOF'
import { TypedEventEmitter } from "../core/events/typed-event-emitter";
import type { GameContext } from "../game-context";
import type { GameFsmEventMap } from "./game-fsm-events";
import type { GameState, GameStateId, GameStateTransitioner } from "./game-state";

type Phase = "idle" | "entering" | "active";

export class GameFsm implements GameStateTransitioner {
  readonly events = new TypedEventEmitter<GameFsmEventMap>();

  private readonly states = new Map<GameStateId, GameState>();
  private current: GameState | null = null;
  private phase: Phase = "idle";
  private transitionToken = 0; // invalida enter() async superados por otra transición

  constructor(private readonly context: GameContext) {}

  get currentId(): GameStateId | null {
    return this.current?.id ?? null;
  }

  /** Registra estados. Se hace después de construir la FSM para que los estados puedan recibirla como transitioner. */
  register(...states: readonly GameState[]): void {
    for (const state of states) {
      if (this.states.has(state.id)) {
        throw new Error(`[GameFsm] duplicated state "${state.id}"`);
      }
      this.states.set(state.id, state);
    }
  }

  async transitionTo(nextId: GameStateId): Promise<void> {
    const next = this.states.get(nextId);
    if (!next) {
      throw new Error(`[GameFsm] state "${nextId}" is not registered`);
    }

    const token = ++this.transitionToken;
    const previousId = this.currentId;
    this.events.emit("transitionStarted", { from: previousId, to: nextId, at: performance.now() });

    if (this.current) {
      const exitingId = this.current.id;
      this.current.exit();
      this.events.emit("stateExited", { id: exitingId, at: performance.now() });
    }

    this.current = next;
    this.phase = "entering";

    const startedAt = performance.now();
    try {
      await next.enter(this.context, previousId);
    } catch (error) {
      this.events.emit("transitionFailed", { to: nextId, error, at: performance.now() });
      throw error;
    }

    if (token !== this.transitionToken) {
      // Otra transición ya llamó a next.exit(); no activar este estado.
      this.events.emit("transitionCancelled", { to: nextId, reason: "superseded", at: performance.now() });
      return;
    }

    this.phase = "active";
    const now = performance.now();
    this.events.emit("stateEntered", { id: nextId, enterDurationMs: now - startedAt, at: now });
  }

  update(deltaTime: number): void {
    if (this.phase === "active") {
      this.current?.update?.(deltaTime);
    }
  }

  dispose(): void {
    this.transitionToken++;
    this.current?.exit();
    this.current = null;
    this.phase = "idle";
    this.events.clear();
  }
}
EOF

write_file "game/fsm/game-state.ts" <<'EOF'
import type { GameContext } from "../game-context";

export type GameStateId =
  | "splash"
  | "assets-loading"
  | "level-setup" // 3A + 3B como pasos internos del mismo estado
  | "playing"
  | "paused"
  | "game-over"
  | "level-cleared"
  | "game-finished";

export interface GameState {
  readonly id: GameStateId;

  /** Puede ser async (carga de assets). `previousId` es null en la primera transición. */
  enter(context: GameContext, previousId: GameStateId | null): void | Promise<void>;

  /** Se llama cada frame solo cuando enter() ya terminó. */
  update?(deltaTime: number): void;

  /**
   * Debe ser seguro e idempotente aunque enter() no haya terminado:
   * la FSM lo llama si otra transición llega mientras el estado todavía carga.
   */
  exit(): void;
}

/** Lo único que un estado necesita de la FSM: pedir una transición. */
export interface GameStateTransitioner {
  transitionTo(id: GameStateId): Promise<void>;
}
EOF

write_file "game/game-context.ts" <<'EOF'
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Dependencias compartidas que reciben los estados de la GameFsm.
 * Mantenerlo chico y de solo lectura: si empieza a crecer, inyectar
 * lo necesario por constructor en cada estado en vez de agregarlo acá.
 */
export interface GameContext {
  readonly scene: Scene;
  readonly engine: AbstractEngine;
  readonly canvas: HTMLCanvasElement;
}
EOF

write_file "game/game.ts" <<'EOF'
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Scene } from "@babylonjs/core/scene";

import { AnyInputService } from "./core/input/any-input-service";
import { ScreenManager } from "./ui/screens/screen-manager";
import type { GameContext } from "./game-context";
import { GameFsm } from "./fsm/game-fsm";
import { AssetsLoadingState } from "./states/assets-loading-state";
import { SplashState } from "./states/splash-state";

/** Raíz de composición del juego: arma el contexto, los servicios, la GameFsm y sus estados. */
export class Game {
  private readonly screens: ScreenManager;
  private readonly input: AnyInputService;
  private readonly fsm: GameFsm;
  private readonly debugHudReady: Promise<void>;
  private detachDebugHud?: () => void;

  constructor(scene: Scene, engine: AbstractEngine, canvas: HTMLCanvasElement) {
    const context: GameContext = { scene, engine, canvas };

    this.screens = new ScreenManager();
    this.input = new AnyInputService();
    this.fsm = new GameFsm(context);
    this.fsm.register(
      new SplashState(this.screens, this.input, this.fsm),
      new AssetsLoadingState(this.screens),
      // próximas iteraciones: LevelSetupState, PlayingState, ...
    );

    // import.meta.env.DEV es `false` literal en el build: la rama (y el import dinámico) se eliminan.
    this.debugHudReady = import.meta.env.DEV ? this.attachDebugHud() : Promise.resolve();
  }

  async start(): Promise<void> {
    await this.debugHudReady; // evita perder los primeros eventos de la FSM
    await this.fsm.transitionTo("splash");
  }

  update(deltaTime: number): void {
    this.fsm.update(deltaTime);
  }

  dispose(): void {
    this.detachDebugHud?.();
    this.fsm.dispose();
    this.input.dispose();
    this.screens.dispose();
  }

  private async attachDebugHud(): Promise<void> {
    const { attachGameDebugHud } = await import("./debug/attach-game-debug-hud");
    this.detachDebugHud = attachGameDebugHud(this.fsm.events);
  }
}
EOF

write_file "game/screens/loading-screen.ts" <<'EOF'
import { HtmlScreen } from "../ui/screens/html-screen";

export class LoadingScreen extends HtmlScreen {
  constructor() {
    super(
      "loading",
      "screen--loading",
      `
        <p class="screen__title">Loading</p>
        <div class="screen__progress"><div class="screen__progress-bar"></div></div>
      `,
    );
  }
}
EOF

write_file "game/screens/splash-screen.ts" <<'EOF'
import { HtmlScreen } from "../ui/screens/html-screen";

export class SplashScreen extends HtmlScreen {
  constructor() {
    super(
      "splash",
      "screen--splash",
      `
        <div class="screen__logo">PLACE LOGO HERE</div>
        <p class="screen__prompt">Press any key</p>
      `,
    );
  }
}
EOF

write_file "game/states/assets-loading-state.ts" <<'EOF'
import type { ScreenManager } from "../ui/screens/screen-manager";
import type { GameState } from "../fsm/game-state";
import { LoadingScreen } from "../screens/loading-screen";

/** Estado 2 — Carga de assets comunes. Placeholder: solo muestra la pantalla de carga. */
export class AssetsLoadingState implements GameState {
  readonly id = "assets-loading" as const;

  private readonly screen = new LoadingScreen();

  constructor(private readonly screens: ScreenManager) {}

  enter(): void {
    this.screens.show(this.screen);
    // TODO 2a: AssetsManager + progreso real
    // TODO 2b: overlay de controles + press any key -> "level-setup"
  }

  exit(): void {
    this.screens.hide(this.screen);
  }
}
EOF

write_file "game/states/splash-state.ts" <<'EOF'
import type { AnyInputService } from "../core/input/any-input-service";
import type { ScreenManager } from "../ui/screens/screen-manager";
import type { GameState, GameStateTransitioner } from "../fsm/game-state";
import { SplashScreen } from "../screens/splash-screen";

/** Estado 1 — Presentación: muestra el splash y avanza con press any key. */
export class SplashState implements GameState {
  readonly id = "splash" as const;

  private readonly screen = new SplashScreen();
  private cancelInputWait: (() => void) | null = null;

  constructor(
    private readonly screens: ScreenManager,
    private readonly input: AnyInputService,
    private readonly transitioner: GameStateTransitioner,
  ) {}

  enter(): void {
    this.screens.show(this.screen);
    this.cancelInputWait = this.input.onNextInput(() => {
      this.transitioner.transitionTo("assets-loading").catch(console.error);
    });
  }

  exit(): void {
    this.cancelInputWait?.();
    this.cancelInputWait = null;
    this.screens.hide(this.screen);
  }
}
EOF

write_file "game/ui/screens/game-screen.ts" <<'EOF'
/**
 * Una pantalla HTML del juego (splash, carga, pausa...).
 * Nota: no se llama `Screen` porque choca con el tipo global del DOM (window.screen).
 */
export interface GameScreen {
  readonly id: string;
  mount(container: HTMLElement): void;
  unmount(): void;
}
EOF

write_file "game/ui/screens/html-screen.ts" <<'EOF'
import type { GameScreen } from "./game-screen";

/** Base para pantallas armadas con HTML estático. `innerHtml` debe ser contenido propio, nunca input del usuario. */
export abstract class HtmlScreen implements GameScreen {
  protected readonly element: HTMLElement;

  protected constructor(
    readonly id: string,
    modifierClass: string,
    innerHtml: string,
  ) {
    this.element = document.createElement("section");
    this.element.className = `screen ${modifierClass}`;
    this.element.dataset.screen = id;
    this.element.innerHTML = innerHtml;
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.element);
  }

  unmount(): void {
    this.element.remove();
  }
}
EOF

write_file "game/ui/screens/screen-manager.ts" <<'EOF'
import type { GameScreen } from "./game-screen";
import "./screens.css";

/**
 * Administra el ciclo de vida de las pantallas HTML: dueño del contenedor
 * overlay y garantiza que haya una sola pantalla activa a la vez.
 */
export class ScreenManager {
  private readonly root: HTMLDivElement;
  private active: GameScreen | null = null;

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement("div");
    this.root.id = "screen-root";
    this.root.className = "screen-root";
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  show(screen: GameScreen): void {
    this.active?.unmount();
    screen.mount(this.root);
    this.active = screen;
    this.root.hidden = false;
  }

  /** Oculta `screen` solo si sigue siendo la activa (evita pisar a la pantalla siguiente). */
  hide(screen: GameScreen): void {
    if (this.active !== screen) {
      return;
    }
    screen.unmount();
    this.active = null;
    this.root.hidden = true;
  }

  dispose(): void {
    this.active?.unmount();
    this.active = null;
    this.root.remove();
  }
}
EOF

write_file "game/ui/screens/screens.css" <<'EOF'
.screen-root {
  --screen-bg: #05070d;
  --screen-fg: #e8f1ff;
  --screen-accent: #5cc8ff;
  --screen-gap: clamp(1.5rem, 6vh, 4rem);

  position: fixed;
  inset: 0;
  z-index: 100; /* debajo del DebugHud (1000) */
  display: flex;
}

.screen-root[hidden] {
  display: none;
}

.screen {
  flex: 1;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--screen-gap);
  padding:
    max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
    max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
  box-sizing: border-box;
  background: radial-gradient(ellipse at center, #0d1626 0%, var(--screen-bg) 70%);
  color: var(--screen-fg);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  text-align: center;
  user-select: none;
}

.screen__logo {
  width: min(70vw, 32rem);
  aspect-ratio: 16 / 9;
  display: grid;
  place-items: center;
  border: 2px dashed color-mix(in srgb, var(--screen-fg) 50%, transparent);
  border-radius: 0.75rem;
  font-size: clamp(1.25rem, 4vw, 2.5rem);
  font-weight: 700;
  letter-spacing: 0.15em;
}

.screen__title {
  margin: 0;
  font-size: clamp(1.25rem, 4vw, 2rem);
  letter-spacing: 0.25em;
  text-transform: uppercase;
}

.screen__prompt {
  margin: 0;
  font-size: clamp(0.9rem, 2.5vw, 1.25rem);
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--screen-accent);
  animation: screen-blink 1.4s ease-in-out infinite;
}

.screen__progress {
  width: min(70vw, 28rem);
  height: 0.5rem;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--screen-fg) 15%, transparent);
}

.screen__progress-bar {
  width: 40%;
  height: 100%;
  border-radius: inherit;
  background: var(--screen-accent);
  animation: screen-indeterminate 1.2s ease-in-out infinite;
}

@keyframes screen-blink {
  50% {
    opacity: 0.25;
  }
}

@keyframes screen-indeterminate {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(250%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .screen__prompt,
  .screen__progress-bar {
    animation: none;
  }
}
EOF

if [[ -d "$BACKUP" ]]; then
  echo "Nota: tu contenido anterior de game/ quedó en $BACKUP (borralo cuando confirmes que no lo necesitás)."
fi
setup_end