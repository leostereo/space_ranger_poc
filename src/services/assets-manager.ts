import { generalConfig } from "@/poc/config.general";
import { Texture, Material, AbstractMesh, AnimationGroup, Scene, AssetsManager, StandardMaterial, MeshBuilder, Color3, Tools, PhysicsAggregate, PhysicsShapeType, Mesh, ArcRotateCamera, Vector3, FollowCamera, HemisphericLight } from "@babylonjs/core";
import { GridMaterial } from "@babylonjs/materials/grid/gridMaterial";
import "@babylonjs/loaders/glTF"; // Obligatorio en Babylon para leer archivos .glb

export type MeshAssetKey = "character" | 'character-capsule' | "board" | 'light' | 'followCamera' | 'arcCamera' | 'ground-basic' | 'ground-grid';
export type LightAssetKey = "main" | "ambient" | "antorcha";
export type CameraAssetKey = "arc" | "follow" | "first";
export type MaterialAssetKey = "board" | "neon" | "ground-basic" | 'grid-ground';
export type AnimationAssetKey = "skater" | "character" | "sentinel";

export class AssetManager {
    // Diccionarios en memoria (privados para que nadie los modifique por fuera)
    private static texturas: Record<string, Texture> = {};
    private static standardMateriales: Record<string, StandardMaterial> = {};
    private static gridMateriales: Record<string, GridMaterial> = {};
    private static meshes: Record<MeshAssetKey, Mesh | AbstractMesh> = {} as Record<MeshAssetKey, Mesh | AbstractMesh>;
    private static cams: Record<string, ArcRotateCamera | FollowCamera> = {};
    private static lights: Record<string, HemisphericLight> = {};

    // Almacén para las animaciones originales de los GLB
    private static animationGroups: Record<AnimationAssetKey, AnimationGroup[]> = {
        skater: [],
        character: [],
        sentinel: []
    };

    /**
     * Carga inicial asincrónica de todos los recursos.
     * Se ejecuta una sola vez al arrancar la aplicación.
     */
    public static cargarTodo(canvas, scene: Scene): Promise<void> {
        return new Promise((resolve) => {
            const manager = new AssetsManager(scene);

            // // --- RECURSO 1: Textura de madera ---
            // const tareaTextura = manager.addTextureTask("txt_madera", "texturas/madera.jpg");
            // tareaTextura.onSuccess = (task) => {
            //     this.texturas["madera"] = task.texture;
            // };

            // --- RECURSO 2: Modelo GLB Externo ---
            const tareaGLB = manager.addMeshTask("glb_personaje", "", "model/", "skater_ver3.glb");
            tareaGLB.onSuccess = (task) => {
                // Buscamos el nodo raíz que crea automáticamente Babylon para los GLB

                const root = task.loadedMeshes.find(m => m.name === "__root__");

                if (root) {
                    // Desactivamos el nodo raíz (apaga al personaje entero y sus hijos)
                    root.setEnabled(false);
                    this.meshes["character"] = root;

                    // Guardamos las animaciones que traía este GLB específico
                    this.animationGroups["character"] = task.loadedAnimationGroups;
                    this.animationGroups['character'].forEach((ag) => ag.stop());
                }
            };

            // --- CUANDO TERMINA LA CARGA DESDE EL SERVIDOR ---
            manager.onFinish = () => {
                // Ahora que las texturas están en memoria, creamos lo que es por código
                this.buildCodedAssets(canvas, scene);
                resolve(); // Avisamos que el módulo global está listo
            };

            manager.load();
        });
    }

    /**
     * Construcción de materiales y meshes propios creados por código
     */
    private static buildCodedAssets(canvas: HTMLCanvasElement, scene: Scene): void {

        this._buildCamerasAndLights(canvas, scene)
        this._buildMaterials(scene);
        // this._builGrounds(scene);
        this._buildCharacterCapsuleAndScaleCharacterModel(scene);
        this._buildBoard(scene);

    }

    /**
     * MÉTODO GLOBAL MÁGICO: Trae una copia lista y limpia de cualquier asset.
     * Maneja automáticamente la lógica compleja de clones y animaciones.
     */
    public static getMesh(clave: MeshAssetKey, nombreInstancia: string, scene: Scene): Mesh | AbstractMesh | null {
        const molde = this.meshes[clave];
        if (!molde) {
            console.error(`El asset "${clave}" no existe en el AssetManager.`);
            return null;
        }

        // 1. Clonamos el mesh base (sea de código o el __root__ del GLB)
        const clon = molde.clone(nombreInstancia, null);
        if (!clon) return null;

        // 2. Si el asset es un GLB con animaciones, clonamos también sus animaciones para esta copia
        const animacionesMolde = this.animationGroups[clave];
        if (animacionesMolde && animacionesMolde.length > 0) {
            animacionesMolde.forEach(animGroup => {
                // Clonamos el grupo de animación apuntando al nuevo clon en lugar del molde oculto
                const clonAnimGroup = animGroup.clone(animGroup.name + "_" + nombreInstancia, (oldTarget) => {
                    // Este callback mapea los huesos del modelo viejo a los del nuevo clon
                    return clon.getChildMeshes().find(m => m.name === oldTarget.name) || oldTarget;
                });

                // Opcional: Podés guardar este clonAnimGroup en un componente del objeto si querés controlarlo
            });
        }

        // 3. Lo activamos para que sea visible y retorne al código
        clon.setEnabled(true);
        return clon;
    }

    public static getAnimations(key: AnimationAssetKey) {
        return this.animationGroups[key]
    }

    public static getLight(key: LightAssetKey, clonar: boolean = false, name?: string): HemisphericLight {
        if (clonar) {
            const clon = this.lights[key].clone(name || `luz_clon_${Date.now()}`) as HemisphericLight;
            clon.setEnabled(true);
            return clon;
        }

        return this.lights[key]
    }

    public static getCamera(key: CameraAssetKey, clonar: boolean = false, name?: string): ArcRotateCamera | FollowCamera {
        if (clonar) {
            const clon = this.cams[key].clone(name || `camara_clon_${Date.now()}`) as ArcRotateCamera | FollowCamera;
            clon.setEnabled(true);
            return clon;
        }

        return this.cams[key];
    }

    public static getStandardMaterial(key: MaterialAssetKey, clone: boolean = false, name?: string): StandardMaterial {
        if (clone) {
            const clon = this.standardMateriales[key].clone(name || `material_clon_${Date.now()}`) as StandardMaterial;
            return clon;
        }

        return this.standardMateriales[key] as StandardMaterial
    }

    public static getGridMaterial(key: MaterialAssetKey): GridMaterial {
        return this.gridMateriales[key] as GridMaterial
    }

    //privates
    private static _buildCharacterCapsuleAndScaleCharacterModel(scene: Scene) {
        // Cápsula principal — maneja rotación y modelo
        const playerHeight = generalConfig.playerConfig.height
        const characterMeshCapsule = MeshBuilder.CreateCapsule("playerCapsule", { height: playerHeight, radius: generalConfig.playerConfig.capsuleRadius }, scene);
        characterMeshCapsule.isVisible = false;
        characterMeshCapsule.isEnabled(false);
        this.meshes['character-capsule'] = characterMeshCapsule;

        const skater = this.meshes['character'];
        skater.computeWorldMatrix(true);
        const { min, max } = skater.getHierarchyBoundingVectors(true); // true = incluye todos los meshes hijos
        const skaterHeight = max.y - min.y;
        const scaleFactor = playerHeight / skaterHeight;
        skater.scaling.setAll(scaleFactor);

    }

    private static _buildCamerasAndLights(canvas: HTMLCanvasElement, scene: Scene): void {
        const { alpha, beta, radius, target } = generalConfig.camera;
        const camera1 = new ArcRotateCamera(
            "poc-camera",
            alpha,
            beta,
            radius,
            new Vector3(target.x, target.y, target.z),
            scene,
        );
        camera1.attachControl(canvas, true);
        camera1.setEnabled(false)
        this.cams['arc'] = camera1

        const camera2 = new FollowCamera("boardCamera", new Vector3(0, 5, 10), scene);
        camera2.radius = 6;          // Distancia horizontal (hacia atrás) en unidades de Babylon
        camera2.heightOffset = 2.0;  // Altura vertical por encima de la patineta
        camera2.rotationOffset = 180;// 180 grados para que mire exactamente desde atrás (0 la miraría de frente)

        // 4. Configurar la elasticidad/suavidad del seguimiento
        camera2.cameraAcceleration = 0.05; // Velocidad de aceleración para alcanzar al objetivo (0.0 a 1.0)
        camera2.maxCameraSpeed = 20;       // Velocidad máxima permitida para la cámara

        this.cams['follow'] = camera2

        const light = new HemisphericLight("poc-light", new Vector3(0, 1, 0), scene);
        light.setEnabled(false)
        this.lights['main'] = light;

    }

    private static _buildMaterials(scene: Scene): void {

        //ground
        const { color: groundColor } = generalConfig.ground;
        const material = new StandardMaterial("poc-ground-material", scene);
        material.diffuseColor = Color3.FromHexString(groundColor);
        material.specularColor = Color3.Black();
        this.standardMateriales['ground-basic'] = material;

        const gridMaterial = new GridMaterial("groundGrid", scene as any);
        gridMaterial.gridRatio = 1.0;
        gridMaterial.mainColor = new Color3(0, 1, 0); // Color of the major lines
        gridMaterial.lineColor = new Color3(0.5, 0.5, 0.5); // Color of the smaller grid lines
        // Control transparency
        gridMaterial.opacity = 0.8; // Lower value makes the grid see-through
        gridMaterial.majorUnitFrequency = 10;
        this.gridMateriales['grid-ground'] = gridMaterial;

        // Crear material
        const matMadera = new StandardMaterial("mat_madera_maestro", scene);
        matMadera.diffuseTexture = this.texturas["madera"];
        this.standardMateriales["madera"] = matMadera;

        // 1. Crear el material Sci-Fi con brillo propio
        const { color, emissiveColor, spawn } = generalConfig.board;
        const boardMaterial = new StandardMaterial("board-material", scene);
        boardMaterial.diffuseColor = Color3.FromHexString(color);
        boardMaterial.emissiveColor = Color3.FromHexString(emissiveColor);
        boardMaterial.specularColor = new Color3(0.2, 0.2, 0.2);
        this.standardMateriales["board"] = boardMaterial;

    }

    private static _builGrounds(scene: Scene): void {
        const { width, thickness } = generalConfig.ground;

        // Definimos las dimensiones y posiciones de las 3 plataformas consecutivas en el eje Z
        // Configuradas de más alta a más baja para probar el planeo y la caída
        const platformsData = [
            { name: "ground-alta", depth: 40, heightOffset: 0.0, zStart: 0 },   // Plataforma de inicio (Alta)
            { name: "ground-media", depth: 40, heightOffset: -145.0, zStart: 155 },  // Segunda plataforma (Media, tras un hueco de 15 unidades)
            { name: "ground-baja", depth: 60, heightOffset: -260.0, zStart: 210 }  // Tercera plataforma (Baja, tras otro hueco de 15 unidades)
        ];

        platformsData.forEach((data) => {
            // A) Crear el Mesh de la plataforma individual
            const groundMesh = MeshBuilder.CreateBox(data.name, {
                width: width,
                depth: data.depth,
                height: thickness
            }, scene);

            // B) Posicionar la plataforma. 
            // Ajustamos la Y para que la parte superior de la caja quede exactamente en la altura deseada (heightOffset)
            groundMesh.position.set(0, data.heightOffset - (thickness / 2), data.zStart);
            groundMesh.material = this.standardMateriales['ground-basic'];

            // Hacemos que sea explícitamente detectable por el Raycast del controlador
            groundMesh.isPickable = true;

            // C) Crear su cuerpo físico estático independiente en Havok
            // Al usar mass: 0, el motor físico sabe que es un objeto inamovible (suelo)
            // new PhysicsAggregate(
            //     groundMesh,
            //     PhysicsShapeType.BOX,
            //     { mass: 0, friction, restitution: 0 },
            //     this.scene,
            // );
        });

    }

    private static _buildBoard(scene): void {

        const { width, height, depth, spawn } = generalConfig.board;

        // 2. Crear la esfera deformada (Óvalo Elipsoide)
        // Mapeamos los ejes para que coincidan con la orientación del vehículo:
        // - diameterX: Ancho de la tabla (width)
        // - diameterY: Grosor/Altura de la tabla (height -> bien delgado)
        // - diameterZ: Largo de la tabla (depth -> el eje más estirado)
        const boardMesh = MeshBuilder.CreateSphere("poc-board", {
            diameterX: width,   // Eje menor horizontal (ancho)
            diameterY: height,  // Eje menor vertical (espesor chato)
            diameterZ: depth,   // Eje mayor (largo que define el frente y atrás)
            segments: 32        // Superficie curva muy suave
        }, scene);

        // Posicionar en el punto de spawn configurado
        boardMesh.position.set(spawn.x, spawn.y, spawn.z);
        boardMesh.material = this.standardMateriales['board'];



        // =========================================================================
        // PIEZA 2: LA COLA (Óvalo Perpendicular Cruzado)
        // =========================================================================
        // Definimos sus dimensiones en base a tus reglas:
        const tailDiameterX = depth / 4; // El ancho de la cola es la mitad del largo de la tabla
        const tailDiameterY = height;    // Mismo espesor para que encajen al ras
        const tailDiameterZ = width;     // El eje principal es del mismo largo que el ancho del cuerpo

        const tailMesh = MeshBuilder.CreateSphere("board-tail", {
            diameterX: tailDiameterX,
            diameterY: tailDiameterY,
            diameterZ: tailDiameterZ,
            segments: 32
        }, scene);

        tailMesh.material = this.standardMateriales['board'];
        tailMesh.parent = boardMesh; // Emparentamos al cuerpo raíz para Havok

        // Posicionamos la cola en el extremo trasero de la patineta (Z negativo)
        // La elevamos levemente en Y (ej: height * 0.4) para darle el look de alerón elevado
        tailMesh.position.set(0, height * 0.4, -(depth / 2));

        // Rotamos la cola:
        // - 90 grados en Y para cruzarla de lado a lado (perpendicular al cuerpo principal)
        // - 20 grados en X para darle inclinación hacia arriba estilo kicktail
        tailMesh.rotation.set(Tools.ToRadians(20), 0, 0);

        boardMesh.setEnabled(false);
        this.meshes["board"] = boardMesh;

        // 3. Física ultra-eficiente con Havok
        // Dado que es un solo óvalo convexo sin huecos, CONVEX_HULL generará una 
        // malla de colisión perfecta y ultra rápida que envuelve el elipsoide de forma exacta.
        // const boardAggregate = new PhysicsAggregate(
        //   boardMesh,
        //   PhysicsShapeType.CONVEX_HULL,
        //   { mass, friction, restitution },
        //   scene,
        // );
        // const massProps = boardAggregate.body.getMassProperties();
        // massProps.inertia!.x = 0;
        // massProps.inertia!.z = 0;
        // boardAggregate.body.setMassProperties(massProps);

        // this.aggregates['boardAggregate'] = boardAggregate;
    }
}
