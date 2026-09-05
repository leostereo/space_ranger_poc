// src/services/assets-manager.ts
//
// CAMBIOS respecto a la versión anterior:
// 1. getMesh() ya devolvía { mesh, animationGroups } (fix previo, animaciones clonadas
//    por instancia en vez de descartadas).
// 2. NUEVO: AssetManager ahora prepara las animaciones de 'character' (lo que antes hacía
//    SkaterAnimator.setupAnimations() en poc2: buscar por nombre de clip, activar
//    blending, parar todo al inicio) UNA sola vez al cargar, como "molde" semántico
//    (`characterAnimationsMold`). getMesh('character', instancia) clona ese molde completo
//    usando la MISMA malla clonada para el remapeo de huesos, y devuelve el resultado ya
//    como diccionario nombrado (`animations: ICharacterAnimations`) en vez de un array
//    crudo — cada consumidor ya no tiene que buscar por nombre de clip.
// 3. Por eso `MeshInstanceResult.animationGroups: AnimationGroup[]` pasa a ser
//    `MeshInstanceResult.animations: ICharacterAnimations | null` (null para assets sin
//    animaciones, ej. 'character-capsule', 'board').
// 4. Lo que NO se movió acá a propósito: el AnimationEvent del frame 30 que dispara
//    notifyJumpImpulseFrame() en poc2 — es un acople específico a BoardFsm, no algo que
//    un servicio compartido entre POCs deba conocer. Eso lo sigue registrando quien
//    consume `animations.jump` (ej. SkaterAnimator), no AssetManager.
//
// ⚠️ Si SkaterAnimator (poc2) sigue usando `AssetManager.getAnimations('character')`
// directo, sigue funcionando igual que antes (ese método no cambió) — pero ya no
// aprovecha el trabajo de blending/prep que ahora hace `_prepareCharacterAnimations()`.
// Vale la pena migrarlo a `getMesh('character', ...).animations` cuando se retome poc2,
// para no tener la lógica de nombres de clips duplicada en dos lugares.

import { Texture, Material, AbstractMesh, AnimationGroup, Scene, AssetsManager, StandardMaterial, MeshBuilder, Color3, Tools, PhysicsAggregate, PhysicsShapeType, Mesh, ArcRotateCamera, Vector3, FollowCamera, HemisphericLight, Axis, Space, Quaternion } from "@babylonjs/core";
import { GridMaterial } from "@babylonjs/materials/grid/gridMaterial";
import { generalConfig } from "@/poc/config.general";
import "@babylonjs/loaders/glTF"; // Obligatorio en Babylon para leer archivos .glb

export type MeshAssetKey = "character" | 'character-capsule' | "board" | 'light' | 'followCamera' | 'arcCamera' | 'ground-basic' | 'ground-grid' | 'batalla del pilar';
export type LightAssetKey = "main" | "ambient" | "antorcha";
export type CameraAssetKey = "arc" | "follow" | "first";
export type MaterialAssetKey = "board" | "neon" | "ground-basic" | 'grid-ground';
export type AnimationAssetKey = "skater" | "character" | "sentinel";
export type TexturetKey = "flare";

/**
 * Diccionario semántico de animaciones del GLB "character" (skater_ver4.glb). Nombres
 * heredados tal cual de ISkaterAnimations (poc2) — varios están claramente atados al
 * contexto de patineta (cruising_forward_idle, etc.). Se mantienen así por ahora para no
 * tocar dos cosas a la vez; renombrarlos a algo más genérico (walk/run/idle puro) queda
 * como tarea aparte cuando StandAlone tenga su propio set de animaciones a pie.
 */
export interface ICharacterAnimations {
    standing_idle: AnimationGroup;
    cruising_forward_idle: AnimationGroup;
    cruising_faster_idle: AnimationGroup;
    cruising_maxVel_idle: AnimationGroup;
    standing_to_crouch: AnimationGroup;
    crouch_to_standing: AnimationGroup;
    jump: AnimationGroup;
    falling: AnimationGroup;
    floating: AnimationGroup;
    flying: AnimationGroup;
    falling_idle: AnimationGroup,

    jump_on_board: AnimationGroup,
    walking_forward: AnimationGroup,
    walking_backwards: AnimationGroup,
    running_normal: AnimationGroup,
    running_fast: AnimationGroup,

}

export interface MeshInstanceResult {
    mesh: Mesh | AbstractMesh;
    /** null si el asset no tiene animaciones preparadas (ej. 'character-capsule', 'board'). */
    animations: ICharacterAnimations | null;
}

export class AssetManager {
    // Diccionarios en memoria (privados para que nadie los modifique por fuera)
    private static textures: Record<string, Texture> = {};
    private static standardMateriales: Record<string, StandardMaterial> = {};
    private static gridMateriales: Record<string, GridMaterial> = {};
    private static meshes: Record<MeshAssetKey, Mesh | AbstractMesh> = {} as Record<MeshAssetKey, Mesh | AbstractMesh>;
    private static cams: Record<string, ArcRotateCamera | FollowCamera> = {};
    private static lights: Record<string, HemisphericLight> = {};

    // Almacén para las animaciones originales de los GLB (crudo, por nombre de clip tal
    // cual viene del archivo — sigue existiendo para getAnimations(), sin cambios).
    private static animationGroups: Record<AnimationAssetKey, AnimationGroup[]> = {
        skater: [],
        character: [],
        sentinel: []
    };

    /** Molde semántico de 'character', armado una sola vez en _prepareCharacterAnimations(). */
    private static characterAnimationsMold: ICharacterAnimations | null = null;

    /**
     * Carga inicial asincrónica de todos los recursos.
     * Se ejecuta una sola vez al arrancar la aplicación.
     */
    public static cargarTodo(canvas, scene: Scene): Promise<void> {
        return new Promise((resolve) => {
            const manager = new AssetsManager(scene);

            // // --- RECURSO 1: Textura de madera ---
            const tareaTextura = manager.addTextureTask("txt_flare", "texture/flare.png");
            tareaTextura.onSuccess = (task) => {
                this.textures["flare"] = task.texture;
            };

            // --- RECURSO 2: Modelo GLB Externo ---
            const tareaGLB = manager.addMeshTask("glb_personaje", "", "model/", "skater_ver6.glb");
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

            // --- RECURSO 3: mapa ---
            const tareaMap = manager.addMeshTask("batalla del pilar", "", "maps/", "topoexport_3D_modeling_batallaDelPilar.glb");
            tareaMap.onSuccess = (task) => {
                // Buscamos el nodo raíz que crea automáticamente Babylon para los GLB

                const root = task.loadedMeshes.find(m => m.name === "__root__");

                if (root) {

                    //root.scaling = new Vector3(0.1, 0.1, 0.1); 
                    
                    if (root.rotationQuaternion) {
                        // root.rotationQuaternion = Quaternion.Identity();
                    }
                    root.position.x =  0;
                    root.position.y = -900;
                    root.position.z = -100;
                    root.rotate(Axis.X, Math.PI / 2, Space.LOCAL);
                    // Desactivamos el nodo raíz (apaga al personaje entero y sus hijos)
                    root.setEnabled(true);
                    this.meshes["batalla del pilar"] = root;
                }
            };

            // --- RECURSO 3: mapa ---
            const tareaMap = manager.addMeshTask("batalla del pilar", "", "maps/", "topoexport_3D_modeling_batallaDelPilar.glb");

            tareaMap.onSuccess = (task) => {
                const root = task.loadedMeshes.find(m => m.name === "__root__");

                if (root) {
                    // 1. Movemos el root a su posición de juego para que las mallas calculen bien sus coordenadas
                    root.position.x = 0;
                    root.position.y = -900;
                    root.position.z = -100;
                    root.rotate(Axis.X, Math.PI / 2, Space.LOCAL);
                    root.setEnabled(true);

                    const todasLasMallas = task.loadedMeshes;

                    // =========================================================
                    // 2. EDIFICIOS
                    // =========================================================
                    const edificios = todasLasMallas.filter(m => m.name && m.name.includes("TPX_Buildings") && m instanceof Mesh) as Mesh[];
                    if (edificios.length > 0) {
                        edificios.forEach(e => e.computeWorldMatrix(true));
                        const edificiosFusionados = Mesh.MergeMeshes(edificios, true, true, undefined, false, true);
                        if (edificiosFusionados) {
                            edificiosFusionados.name = "FUSION_EDIFICIOS";
                            // 🌟 SALVAMOS LA MALLA: La sacamos del root original para que no se borre
                            edificiosFusionados.setParent(null);
                            this.meshes["mapa_edificios"] = edificiosFusionados;
                        }
                    }

                    // =========================================================
                    // 3. ÁRBOLES
                    // =========================================================
                    const regexArboles = /^node\d+/i;
                    const arboles = todasLasMallas.filter(m => m.name && regexArboles.test(m.name) && m instanceof Mesh) as Mesh[];
                    if (arboles.length > 0) {
                        arboles.forEach(a => a.computeWorldMatrix(true));
                        const arbolesFusionados = Mesh.MergeMeshes(arboles, true, false, undefined, false, true);
                        if (arbolesFusionados) {
                            arbolesFusionados.name = "FUSION_ARBOLES";
                            // 🌟 SALVAMOS LA MALLA:
                            arbolesFusionados.setParent(null);
                            this.meshes["mapa_arboles"] = arbolesFusionados;
                        }
                    }

                    // =========================================================
                    // 4. CALLES
                    // =========================================================
                    const calles = todasLasMallas.filter(m => m.name && m.name.includes("TPX_RoadsOutlines") && m instanceof Mesh) as Mesh[];
                    if (calles.length > 0) {
                        calles.forEach(c => c.computeWorldMatrix(true));
                        const callesFusionadas = Mesh.MergeMeshes(calles, true, true, undefined, false, true);
                        if (callesFusionadas) {
                            callesFusionadas.name = "FUSION_CALLES";
                            // 🌟 SALVAMOS LA MALLA:
                            callesFusionadas.setParent(null);
                            this.meshes["mapa_calles"] = callesFusionadas;
                        }
                    }

                    // =========================================================
                    // 5. ÁREAS VERDES
                    // =========================================================
                    const areasVerdes = todasLasMallas.filter(m => m.name && m.name.includes("TPX_GreenAreas") && m instanceof Mesh) as Mesh[];
                    if (areasVerdes.length > 0) {
                        areasVerdes.forEach(av => av.computeWorldMatrix(true));
                        const areasVerdesFusionadas = Mesh.MergeMeshes(areasVerdes, true, true, undefined, false, true);
                        if (areasVerdesFusionadas) {
                            areasVerdesFusionadas.name = "FUSION_AREAS_VERDES";
                            // 🌟 SALVAMOS LA MALLA:
                            areasVerdesFusionadas.setParent(null);
                            this.meshes["mapa_areas_verdes"] = areasVerdesFusionadas;
                        }
                    }

                    // =========================================================
                    // 6. VÍAS DE AGUA
                    // =========================================================
                    const viasAgua = todasLasMallas.filter(m => m.name && m.name.includes("TPX_Waterways") && m instanceof Mesh) as Mesh[];
                    if (viasAgua.length > 0) {
                        viasAgua.forEach(va => va.computeWorldMatrix(true));
                        const aguaFusionada = Mesh.MergeMeshes(viasAgua, true, true, undefined, false, true);
                        if (aguaFusionada) {
                            aguaFusionada.name = "FUSION_AGUA";
                            // 🌟 SALVAMOS LA MALLA:
                            aguaFusionada.setParent(null);
                            this.meshes["mapa_agua"] = aguaFusionada;
                        }
                    }

                    // =========================================================
                    // 7. SUELO BASE INDEPENDIENTE
                    // =========================================================
                    const sueloUnico = todasLasMallas.find(m => m.name && m.name.includes("TPX_Ground") && m instanceof Mesh) as Mesh;
                    if (sueloUnico) {
                        sueloUnico.computeWorldMatrix(true);
                        // 🌟 SALVAMOS LA MALLA:
                        sueloUnico.setParent(null);
                        sueloUnico.name = "FUSION_SUELO";
                        this.meshes["suelo_hoverboard"] = sueloUnico;
                    }

                    // =========================================================
                    // 🔥 8. EL GRAN LIMPIADOR DE BASURA
                    // =========================================================
                    // En este punto, todas nuestras mallas optimizadas ya están a salvo fuera del root.
                    // Lo que queda adentro de 'root' son solo cáscaras vacías y nodos viejos del GLB.
                    // Los destruimos para liberar memoria por completo.
                    root.dispose(false, true);

                    console.log("¡Limpieza total completada! Solo quedan vivas las mallas fusionadas y el suelo.");
                }
            };
                        
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
        this._prepareCharacterAnimations();

    }

    /**
     * Arma el molde semántico UNA sola vez (mismo trabajo que hacía
     * SkaterAnimator.setupAnimations() en poc2: buscar por nombre de clip exacto, activar
     * blending, parar todo). NO registra el AnimationEvent del salto — eso es
     * responsabilidad de quien consuma `animations.jump` en cada POC específico.
     */
    private static _prepareCharacterAnimations(): void {
        const groups = this.animationGroups["character"];
        const find = (name: string): AnimationGroup | undefined => groups.find((g) => g.name === name);

        const standing_idle = find("standing idle");
        const cruising_forward_idle = find("skate_idle");
        const cruising_faster_idle = find("ninja crouch idle mirror");
        const cruising_maxVel_idle = find("skate crouching idle");
        const standing_to_crouch = find("skate standing to crouch");
        const crouch_to_standing = find("skate crouch to standing");
        const jump = find("jump in place2");
        const falling = find("skate falling to landing");

        const falling_idle = find("falling idle");
        const flying = find("flying");
        const floating = find("floating");
        //const falling_to_landing = find("falling ro landing"); repetido

        const jump_on_board = find("jump on board");
        const walking_forward = find("walking forward");
        const walking_backwards = find("walking backwards");
        const running_normal = find("running normal");
        const running_fast = find("running fast");



        if (!standing_idle || !cruising_forward_idle || !cruising_faster_idle || !cruising_maxVel_idle ||
            !standing_to_crouch || !crouch_to_standing || !jump || !falling || !falling_idle ||
            !flying || !floating || !jump_on_board || !walking_forward || !walking_backwards ||
            !running_normal || !running_fast) {
            console.warn("AssetManager: faltan animaciones de 'character' — revisar nombres de clips en el GLB.");
            return;
        }

        const mold: ICharacterAnimations = {
            standing_idle, cruising_forward_idle, cruising_faster_idle, cruising_maxVel_idle,
            standing_to_crouch, crouch_to_standing, jump, falling, floating, flying,
            falling_idle, jump_on_board, walking_forward, walking_backwards,
            running_fast,running_normal
        };

        Object.values(mold).forEach((ag) => {
            ag.enableBlending = true;
            ag.blendingSpeed = 0.1;
        });

        groups.forEach((g) => g.stop());

        this.characterAnimationsMold = mold;
    }

    /** Clona cada AnimationGroup del molde, remapeando huesos contra `clon` (la instancia recién creada). */
    private static _cloneCharacterAnimations(clon: Mesh | AbstractMesh, nombreInstancia: string): ICharacterAnimations | null {
        if (!this.characterAnimationsMold) return null;

        const cloneOne = (animGroup: AnimationGroup): AnimationGroup =>
            animGroup.clone(animGroup.name + "_" + nombreInstancia, (oldTarget) =>
                clon.getChildMeshes().find((m) => m.name === oldTarget.name) || oldTarget,
            );

        const mold = this.characterAnimationsMold;
        return {
            standing_idle: cloneOne(mold.standing_idle),
            cruising_forward_idle: cloneOne(mold.cruising_forward_idle),
            cruising_faster_idle: cloneOne(mold.cruising_faster_idle),
            cruising_maxVel_idle: cloneOne(mold.cruising_maxVel_idle),
            standing_to_crouch: cloneOne(mold.standing_to_crouch),
            crouch_to_standing: cloneOne(mold.crouch_to_standing),
            jump: cloneOne(mold.jump),
            falling: cloneOne(mold.falling),
            floating: cloneOne(mold.floating),
            flying: cloneOne(mold.flying),
            falling_idle: cloneOne(mold.falling_idle),

            walking_backwards: cloneOne(mold.walking_backwards),
            walking_forward: cloneOne(mold.walking_forward),
            jump_on_board: cloneOne(mold.jump_on_board),
            running_fast: cloneOne(mold.running_fast),
            running_normal: cloneOne(mold.running_normal),
            
        };
    }

    /**
     * MÉTODO GLOBAL MÁGICO: Trae una copia lista y limpia de cualquier asset.
     * Maneja automáticamente la lógica compleja de clones y animaciones.
     *
     * Para clave === 'character': `animations` viene del molde semántico ya preparado
     * (ver _prepareCharacterAnimations), clonado y remapeado contra esta instancia. Para
     * el resto de las claves (sin animaciones), `animations` es null.
     */
    public static getMesh(clave: MeshAssetKey, nombreInstancia: string): MeshInstanceResult | null {
        const molde = this.meshes[clave];
        if (!molde) {
            console.error(`El asset "${clave}" no existe en el AssetManager.`);
            return null;
        }

        // 1. Clonamos el mesh base (sea de código o el __root__ del GLB)
        const clon = molde.clone(nombreInstancia, null);
        if (!clon) return null;

        // 2. Si es 'character' y el molde de animaciones está listo, clonamos el
        //    diccionario semántico completo usando ESTE clon para el remapeo de huesos.
        const animations = clave === "character" ? this._cloneCharacterAnimations(clon, nombreInstancia) : null;

        // 3. Lo activamos para que sea visible y retorne al código
        clon.setEnabled(true);
        return { mesh: clon, animations };
    }

    public static getTexture(key: TexturetKey): Texture {
        return this.textures[key] as Texture
    }

    /** Crudo, sin preparar — devuelve los AnimationGroup originales tal cual vinieron del GLB. */
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
            "arc_camera",
            alpha,
            beta,
            radius,
            new Vector3(target.x, target.y, target.z),
            scene,
        );
        camera1.attachControl(canvas, true);
        camera1.setEnabled(false)
        this.cams['arc'] = camera1

        const camera2 = new FollowCamera("mainFollowCamera", new Vector3(0, 5, 10), scene);
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
        matMadera.diffuseTexture = this.textures["madera"];
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
        const tailDiameterY = height / 2;    // mitad del espesor
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
        tailMesh.position.set(0, height * 0.3, -(depth / 2));

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