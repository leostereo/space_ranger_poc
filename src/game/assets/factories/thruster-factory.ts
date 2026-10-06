import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

const BODY_LENGTH = 0.12;
const BODY_DIAMETER = 0.06;
const CONE_LENGTH = 0.05;
const CONE_BASE_DIAMETER = 0.09; // base ancha pegada al cuerpo; el vértice apunta hacia afuera (salida del chorro)
const TESSELLATION = 16;
const SIDE_OFFSET_X = 0.08; // separación lateral de cada propulsor respecto del centro del grupo
const MARKER_SIZE = 0.0001; // las cajas "raíz" son solo marcadores de transform (invisibles)

export interface ThrusterPrefab {
  readonly group: TransformNode;
  readonly left: Mesh;
  readonly right: Mesh;
  /** Punta del cono izquierdo: de acá sale el chorro. */
  readonly leftNozzle: TransformNode;
  readonly rightNozzle: TransformNode;
  dispose(): void;
}

/**
 * Crea un par de propulsores NUEVO en cada llamada. Nace deshabilitado.
 * Quien lo crea es dueño y debe llamar a dispose().
 */
export function createThrusterPrefab(scene: Scene, prefix = ""): ThrusterPrefab {
  const group = new TransformNode(`${prefix}thrusterGroup`, scene);

  const material = new StandardMaterial(`${prefix}thrusterMat`, scene);
  material.diffuseColor = new Color3(0.25, 0.25, 0.3);
  material.specularColor = new Color3(0.1, 0.1, 0.1);

  const buildOne = (name: string): { root: Mesh; nozzle: TransformNode } => {
    const root = CreateBox(`${prefix}${name}Root`, { size: MARKER_SIZE }, scene);
    root.isVisible = false;
    root.isPickable = false;
    root.parent = group;

    const body = CreateCylinder(
      `${prefix}${name}Body`,
      { diameter: BODY_DIAMETER, height: BODY_LENGTH, tessellation: TESSELLATION },
      scene,
    );
    body.parent = root;
    body.rotation.x = Math.PI / 2;
    body.position.z = BODY_LENGTH / 2;
    body.isPickable = false;
    body.material = material;

    // Cono (diameterTop = 0): base ancha pegada al cuerpo, vértice hacia afuera.
    const cone = CreateCylinder(
      `${prefix}${name}Cone`,
      { diameterTop: 0, diameterBottom: CONE_BASE_DIAMETER, height: CONE_LENGTH, tessellation: TESSELLATION },
      scene,
    );
    cone.parent = root;
    cone.rotation.x = -Math.PI / 2;
    cone.position.z = BODY_LENGTH + CONE_LENGTH / 2;
    cone.isPickable = false;
    cone.material = material;

    const nozzle = new TransformNode(`${prefix}${name}Nozzle`, scene);
    nozzle.parent = root;
    nozzle.position.set(0, 0, BODY_LENGTH + CONE_LENGTH); // punta del cono

    return { root, nozzle };
  };

  const left = buildOne("thrusterLeft");
  const right = buildOne("thrusterRight");
  left.root.position.set(-SIDE_OFFSET_X, 0, 0);
  right.root.position.set(SIDE_OFFSET_X, 0, 0);

  group.setEnabled(false);

  return {
    group,
    left: left.root,
    right: right.root,
    leftNozzle: left.nozzle,
    rightNozzle: right.nozzle,
    dispose: () => {
      group.dispose(false, false);
      material.dispose();
    },
  };
}
