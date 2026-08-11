export const poc1Config = {
  camera: {
    alpha: -Math.PI / 2.5,
    beta: Math.PI / 2.8,
    radius: 12,
    target: { x: 0, y: 1, z: 0 },
  },
  ground: {
    width: 150,
    depth: 150,
    thickness: 0.4,
    friction: 0.6,
    color: "#33383f",
  },
  board: {
    // Dimensiones placeholder del mesh de la patineta (a reemplazar por el modelo final)
    width: 0.6,
    height: 0.15,
    depth: 1.6,
    mass: 20,
    friction: 0.2,
    restitution: 0,
    color: "#00e5ff",
    emissiveColor: "#0a4a52",
    spawn: { x: 2, y:5, z: 0 }, // offset horizontal para no tapar el gizmo/ejes en el centro
  },
  hover: {
    // Paso 2: efecto de levitación en idle
    height: 1.2, // altura de hover sobre el ground detectado
    springStrength: 40,
    damping: 8,
    bobAmplitude: 0.08,
    bobFrequency: 0.35, // Hz — lento y suave
  },
  falling: {
    // Paso 3+: sin ground detectado
    minSlope: -2, // m/s
    maxSlope: -8, // m/s
  },
  groundCheck: {
    rayRange: 2, // m
    coyoteTime: 0.15, // s
  },
  boost: {
    // salto en Grounded / GliderBoost en Falling (mismo botón, distinto efecto)
    impulse: 6, // m/s
    successiveDecay: 0.6,
  },
  movement: {
    forwardForce: 150, // N, aplicada en la dirección forward del board mientras se mantiene Shift
    maxRollAngle: Math.PI / 6, // 30°, banco máximo al mantener A/D
    rollLerpSpeed: 6, // qué tan rápido alcanza el banco objetivo (y vuelve a 0 al soltar)
    yawFromRollFactor: -1.8, // rad/s de yaw por cada radián de banco — viraje coordinado, como un avión
    maxPitchAngle: 45, 
    pitchLerpSpeed: 5,
    pitchDiveAcceleration: 12,
  },
  testImpulse: {
    // Simula el peso del personaje al saltar sobre el board (tecla T)
    downwardVelocityKick: 3, // m/s de cambio instantáneo de velocidad vertical
  },
};