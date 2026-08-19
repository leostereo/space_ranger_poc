import { generalConfig } from "@/poc/config.general";
import { AssetManager } from "@/services/assets-manager";
import { Axis, Camera, Mesh, MeshBuilder, PhysicsAggregate, PhysicsShapeType, Scene, Space, StandardMaterial, Tools, Vector3 } from "@babylonjs/core";

export const scene_builder = (scene: Scene): PhysicsAggregate[] => {

    const groundAggs: PhysicsAggregate[] = [];

    const light = AssetManager.getLight('main', false, 'light');
    light.setEnabled(true);
    const camera = AssetManager.getCamera('arc', false, 'camera')

    const { width, depth, thickness, friction, color } = generalConfig.ground;

    // Definimos las dimensiones y posiciones de las 3 plataformas consecutivas en el eje Z
    // Configuradas de más alta a más baja para probar el planeo y la caída
    const platformsData = [
        { name: "ground-inicio", depth: 400, heightOffset: 0.0, zStart: 0 },
        { name: "ground-media", depth: 40, heightOffset: -100, zStart: 300 },
        { name: "ground-alta", depth: 80, heightOffset: 20, zStart: 300 },
        { name: "ground-baja", depth: 60, heightOffset: -260.0, zStart: 210 }  // Tercera plataforma (Baja, tras otro hueco de 15 unidades)
    ];

    const material = AssetManager.getGridMaterial('grid-ground');
    
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
        groundMesh.material = material;

        // Hacemos que sea explícitamente detectable por el Raycast del controlador
        groundMesh.isPickable = true;

        new PhysicsAggregate(
            groundMesh,
            PhysicsShapeType.BOX,
            { mass: 0, friction, restitution: 0 },
            scene,
        );
    });

    // --- RAMPA ---
    const rampAgg = _buildRamp(scene, material, friction);
    groundAggs.push(rampAgg);

    return groundAggs;
}

const _buildRamp = (scene: Scene, material: any, friction: number): PhysicsAggregate => {
    const { width, length, thickness, angleDeg, baseZ } = generalConfig.ramp;
    const groundTopY = 0; // top de "ground-alta" (heightOffset=0)

    // Cambiá el signo si la rampa queda mirando para el lado equivocado
    // (depende de si el board avanza en +Z o -Z).
    const angleRad = Tools.ToRadians(angleDeg);

    const rampMesh = MeshBuilder.CreateBox("ramp", {
        width,
        depth: length,
        height: thickness,
    }, scene);

    rampMesh.rotation.x = -angleRad;

    // Centro del box calculado para que el borde bajo-frontal quede flush con el piso en baseZ.
    // (derivado de rotar el offset local del borde por el ángulo de la rampa)
    const centerY = groundTopY + (thickness / 2) * Math.cos(angleRad) + (length / 2) * Math.sin(angleRad);
    const centerZ = baseZ + (length / 2) * Math.cos(angleRad) - (thickness / 2) * Math.sin(angleRad);

    rampMesh.position.set(0, centerY, centerZ);
    rampMesh.material = material;
    rampMesh.isPickable = true;

    return new PhysicsAggregate(
        rampMesh,
        PhysicsShapeType.BOX,
        { mass: 0, friction, restitution: 0 },
        scene,
    );
};

export const board_character_builder = (scene: Scene): { boardMesh: Mesh, boardAggregate: PhysicsAggregate } => {

    const boardMesh = AssetManager.getMesh("board", "skateboard") as Mesh;
    if (boardMesh) {
        const { x, y, z } = generalConfig.board.spawn;
        boardMesh.position.set(x, y, z); // elevado del suelo a propósito: valida Falling -> Hovering
        //scene.getMeshByName('poc-board')?.dispose();
        const camera = AssetManager.getCamera('follow', false, 'camera')
        camera.lockedTarget = boardMesh;
        scene.activeCamera = camera;

    }

    const skater = AssetManager.getMesh('character', 'character');
    const capsule = AssetManager.getMesh('character-capsule', 'character-capsule');

    if (capsule && skater) {
        skater.setEnabled(true);
        capsule.setEnabled(true);
        capsule.isVisible = false; 

        // Configurar el contorno (wireframe) de la cápsula
        if (!capsule.material) {
            capsule.material = new StandardMaterial("capsuleDebugMat", scene);
        }
        capsule.material.alpha = 0.3;

        // Posición inicial del contenedor físico en el mundo
        const spawnPos = generalConfig.playerConfig.player1.spawn;
        capsule.position.set(spawnPos.x, spawnPos.y, spawnPos.z);

        // Emparentar y aplicar offsets locales (posición y rotación)
        skater.setParent(capsule);

        //skater.rotationQuaternion = null;
        const capsuleHeight = 2; // Ajustá según la altura de tu cápsula
        skater.position.set(0, -(capsuleHeight / 2), 0);
        skater.rotate(Axis.Y, Math.PI, Space.LOCAL);

        capsule.setParent(boardMesh);
        capsule.rotationQuaternion = null; // Liberamos por si la cápsula también venía de GLTF

        //capsule offset position on the table
        const offsetX_Capsule = 0.15;  
        const offsetZ_Capsule = -0.15;  
        const boardThicknessOffset = 0.1;
        const capsuleYOffset = (capsuleHeight / 2) + boardThicknessOffset;

        capsule.position.set(offsetX_Capsule, capsuleYOffset, offsetZ_Capsule);

        capsule.rotation.set(0, -Math.PI / 8, 0); // little offset rotation for standing pose.

        const { mass, friction, restitution } = generalConfig.board;
        const boardAggregate = new PhysicsAggregate(
            boardMesh,
            PhysicsShapeType.CONVEX_HULL,
            { mass, friction, restitution },
            scene,
        );

        // Sólo yaw es físico (llega en Paso 4b); roll/pitch son 100% visuales.
        // Bloquea rotación física en X/Z para que ningún choque tumbe el body. Validado en POC1.
        const massProperties = boardAggregate.body.getMassProperties();
        massProperties.inertia!.x = 0;
        massProperties.inertia!.z = 0;
        boardAggregate.body.setMassProperties(massProperties);

        boardAggregate.body.setGravityFactor(1);

        return { boardMesh, boardAggregate }

    } else {
        throw new Error('No capsule nor skater , cant continue')
    }

}