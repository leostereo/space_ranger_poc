import { generalConfig } from "@/poc/config.general";
import { AssetManager } from "@/services/assets-manager";
import { Mesh, MeshBuilder, PhysicsAggregate, PhysicsShapeType, Scene, Vector3 } from "@babylonjs/core";

export const scene_builder = (scene:Scene):PhysicsAggregate => {

        const light = AssetManager.getLight('main', false, 'light');
        light.setEnabled(true);
        const camera = AssetManager.getCamera('arc', false, 'camera')
       
        const { width, depth, thickness, friction, color } = generalConfig.ground;

        const groundMesh = MeshBuilder.CreateBox("poc2-ground", { width, depth, height: thickness }, scene);
        groundMesh.position.set(0, -thickness / 2, 0);
        groundMesh.isPickable = true;

        const material = AssetManager.getMaterial('ground-basic') 
        groundMesh.material = material;

        const groundAggregate = new PhysicsAggregate(
            groundMesh,
            PhysicsShapeType.BOX,
            { mass: 0, friction, restitution: 0 },
            scene,
        );

        return groundAggregate;
}

export const board_character_builder = (scene:Scene):{boardMesh:Mesh,boardAggregate:PhysicsAggregate} => {

        const boardMesh = AssetManager.getMesh("board", "skateboard", scene) as Mesh;
        if (boardMesh) {
            const { x, y, z } = generalConfig.board.spawn;
            boardMesh.position.set(x, y, z); // elevado del suelo a propósito: valida Falling -> Hovering
            // scene.getMeshByName('poc-board')?.dispose();
        }
        
        const skater = AssetManager.getMesh('character', 'character', scene);
        const  capsule = AssetManager.getMesh('character-capsule','character-capsule',scene);
        
        if (capsule && skater) {
            skater.setEnabled(true)
            capsule.setEnabled(true);
            capsule.isVisible = true;
            const spawnPos = generalConfig.playerConfig.player1.spawn;
            capsule.position.copyFrom(new Vector3(spawnPos.x, spawnPos.y, spawnPos.z));
            skater.position.copyFrom(capsule.position);

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

        return {boardMesh,boardAggregate}

        }else{
            throw new Error('No capsule nor skater , cant continue')
        }

}