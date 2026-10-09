import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Dueño de TODO lo que se crea para un nivel. Al terminar el nivel un solo dispose() lo libera:
 * los nodos colgados de `root` y cualquier cosa registrada (cuerpos de Havok, observers, cámaras...).
 */
export class LevelScope {
  readonly root: TransformNode;

  private readonly disposers: (() => void)[] = [];
  private disposed = false;

  constructor(
    scene: Scene,
    readonly levelId: string,
  ) {
    this.root = new TransformNode(`level-root:${levelId}`, scene);
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Registra algo para liberar junto con el nivel (en orden inverso al de registro).
   * Si el scope ya fue liberado, lo libera de inmediato: así una carga cancelada no deja basura.
   */
  register<T extends { dispose(): void }>(item: T): T {
    if (this.disposed) {
      item.dispose();
    } else {
      this.disposers.push(() => item.dispose());
    }
    return item;
  }

  /** Cuelga un nodo de la raíz del nivel conservando su transform en el mundo. */
  adopt<T extends TransformNode>(node: T): T {
    node.setParent(this.root);
    return node;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const dispose of this.disposers.reverse()) {
      try {
        dispose();
      } catch (error) {
        console.error(`[LevelScope] failed to dispose a resource of "${this.levelId}"`, error);
      }
    }
    this.disposers.length = 0;
    this.root.dispose(false, true); // hijos + sus materiales y texturas
  }
}
