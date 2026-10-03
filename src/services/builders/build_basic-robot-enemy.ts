import { 
    TransformNode, 
    StandardMaterial, 
    Color3, 
    MeshBuilder, 
    Vector3 
} from "@babylonjs/core";

export function builder_basic_enemy(scene) {
    const maestroRaiz = new TransformNode("maestroRaiz", scene);

    const materialEnemigo = new StandardMaterial("matEnemigo", scene);
    materialEnemigo.diffuseColor = new Color3(0.5, 0.6, 0.7); 

    // ==========================================
    // PARÁMETROS DE PROPORCIÓN (Androide Alto/Delgado)
    // ==========================================
    const grosorMiembros = 0.10; 
    const anchoHombros = 0.70 * 0.8; // Reducido un 20% para hacerlo más angosto (0.56)
    
    const hCintura = 0.20;
    const hTorso = 0.80;      
    const hMuslo = 0.60;      
    const hPantorrilla = 0.60;
    const hBrazo = 0.45;
    const hAntebrazo = 0.45;
    const rArticulacion = 0.08; 

    // ==========================================
    // 1. PARTE INFERIOR: Cintura y Pierna Izquierda
    // ==========================================
    const pivotInferior = new TransformNode("pivotInferior", scene);
    pivotInferior.parent = maestroRaiz;

    const cintura = MeshBuilder.CreateBox("cintura", { width: 0.45, height: hCintura, depth: 0.45 }, scene);
    cintura.material = materialEnemigo;
    cintura.parent = pivotInferior;
    cintura.position.y = hPantorrilla + rArticulacion * 2 + hMuslo + (hCintura / 2);

    // --- PIERNA IZQUIERDA ---
    const piernaIzqContenedor = new TransformNode("piernaIzqContenedor", scene);
    piernaIzqContenedor.parent = cintura;
    piernaIzqContenedor.position.set(-0.18, -hCintura/2, 0);

    const musloI = MeshBuilder.CreateCylinder("musloI", { height: hMuslo, diameter: grosorMiembros }, scene);
    musloI.material = materialEnemigo;
    musloI.parent = piernaIzqContenedor;
    musloI.setPivotPoint(new Vector3(0, hMuslo / 2, 0));
    musloI.position.y = -hMuslo / 2;

    const rodillaI = MeshBuilder.CreateSphere("rodillaI", { diameter: rArticulacion * 2 }, scene);
    rodillaI.material = materialEnemigo;
    rodillaI.parent = musloI;
    rodillaI.position.y = -hMuslo / 2;

    const pantorrillaI = MeshBuilder.CreateCylinder("pantorrillaI", { height: hPantorrilla, diameter: grosorMiembros * 0.9 }, scene);
    pantorrillaI.material = materialEnemigo;
    pantorrillaI.parent = rodillaI;
    pantorrillaI.setPivotPoint(new Vector3(0, hPantorrilla / 2, 0));
    pantorrillaI.position.y = -hPantorrilla / 2;

    const pieI = MeshBuilder.CreateSphere("pieI", { diameter: 1 }, scene);
    pieI.material = materialEnemigo;
    pieI.parent = pantorrillaI;
    pieI.scaling.set(grosorMiembros * 1.2, 0.05, 0.25); // Óvalo estirado en Z
    pieI.position.set(0, -hPantorrilla / 2, 0.08);


    // ==========================================
    // 2. PARTE SUPERIOR: Torso, Cabeza y Brazo Izquierdo
    // ==========================================
    const pivotSuperior = new TransformNode("pivotSuperior", scene);
    pivotSuperior.parent = maestroRaiz;
    pivotSuperior.position.y = cintura.position.y + hCintura/2;

    const torso = MeshBuilder.CreateBox("torso", { width: anchoHombros, height: hTorso, depth: 0.3 }, scene);
    torso.material = materialEnemigo;
    torso.parent = pivotSuperior;
    torso.setPivotPoint(new Vector3(0, -hTorso / 2, 0));
    torso.position.y = hTorso / 2;

    const cabeza = MeshBuilder.CreateBox("cabeza", { width: 0.2, height: 0.28, depth: 0.2 }, scene);
    cabeza.material = materialEnemigo;
    cabeza.parent = torso;
    cabeza.position.y = hTorso / 2 + 0.14;

    // --- BRAZO IZQUIERDO ---
    const brazoIzqContenedor = new TransformNode("brazoIzqContenedor", scene);
    brazoIzqContenedor.parent = torso;
    brazoIzqContenedor.position.set(-anchoHombros / 2, hTorso / 2 - 0.1, 0);

    const brazoI = MeshBuilder.CreateCylinder("brazoI", { height: hBrazo, diameter: grosorMiembros }, scene);
    brazoI.material = materialEnemigo;
    brazoI.parent = brazoIzqContenedor;
    brazoI.setPivotPoint(new Vector3(0, hBrazo / 2, 0)); 
    brazoI.position.x = -hBrazo / 2; 
    brazoI.rotation.z = Math.PI / 2; 

    const codoI = MeshBuilder.CreateSphere("codoI", { diameter: rArticulacion * 2 }, scene);
    codoI.material = materialEnemigo;
    codoI.parent = brazoI;
    codoI.position.y = -hBrazo / 2; 

    const antebrazoI = MeshBuilder.CreateCylinder("antebrazoI", { height: hAntebrazo, diameter: grosorMiembros * 0.85 }, scene);
    antebrazoI.material = materialEnemigo;
    antebrazoI.parent = codoI;
    antebrazoI.setPivotPoint(new Vector3(0, hAntebrazo / 2, 0));
    antebrazoI.position.y = -hAntebrazo / 2; 

    // Mano modificada (Ahora es un óvalo estirado en Z, similar al pie)
    const manoI = MeshBuilder.CreateSphere("manoI", { diameter: 1 }, scene);
    manoI.material = materialEnemigo;
    manoI.parent = antebrazoI;
    manoI.scaling.set(grosorMiembros * 1.0, 0.04, 0.18); // Silueta alargada hacia el frente
    manoI.position.set(0, -hAntebrazo / 2, 0.05); // Ajustada levemente hacia adelante en Z

    // Recordá comentar esta línea temporalmente en tu código para poder verlo en la escena
    maestroRaiz.setEnabled(false);

    return {
        maestroRaiz,
        piernaIzqContenedor,
        pivotSuperior,
        brazoIzqContenedor,
        brazoI
    };
}
