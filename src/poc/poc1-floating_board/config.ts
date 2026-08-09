export const poc1Config = {
  camera: {
    alpha: -Math.PI / 2.5,
    beta: Math.PI / 2.8,
    radius: 12,
    target: { x: 0, y: 1, z: 0 },
  },
  ground: {
    width: 40,
    height: 40,
  },
  board: {
    // Dimensiones placeholder del mesh de la patineta (a reemplazar por el modelo final)
    width: 0.6,
    height: 0.15,
    depth: 1.6,
    // TODO: valores de la física de flotación (altura de hover, fuerza, amortiguación, tilt máximo)
    // se definen cuando diseñemos el floating-board-controller.
  },
};