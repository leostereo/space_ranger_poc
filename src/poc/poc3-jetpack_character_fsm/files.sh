#!/usr/bin/env bash
# create-poc3-structure.sh
# Crea el esqueleto de archivos vacíos de POC3, con un header de path en cada .ts,
# igual al criterio usado en poc2 (primera línea del archivo = ruta relativa).
#
# Uso: correr desde la raíz del repo (donde vive src/).
#   chmod +x create-poc3-structure.sh
#   ./create-poc3-structure.sh

set -euo pipefail

ROOT="src/poc/poc3-jetpack_character_fsm"

# path relativo -> se usa tanto para mkdir -p (dirname) como para el header del archivo
FILES=(
  "character.base.ts"
  "character.hud.ts"
  "character.input.ts"
  "utils/utils.ts"
  "character-fsm/character.fsm.ts"
  "character-fsm/character.fsm.no-vehicle.ts"
  "character-fsm/character.fsm.jetpack.ts"
  "strategies/contracts/ivehicle-strategy.ts"
  "strategies/contracts/iphysics-controller.ts"
  "strategies/contracts/iinput-controller.ts"
  "strategies/contracts/ianimation-controller.ts"
  "strategies/no-vehicle/no-vehicle.physics.controller.ts"
  "strategies/no-vehicle/no-vehicle.input.controller.ts"
  "strategies/no-vehicle/no-vehicle.animation.controller.ts"
  "strategies/jetpack/jetpack.physics.controller.ts"
  "strategies/jetpack/jetpack.input.controller.ts"
  "strategies/jetpack/jetpack.animation.controller.ts"
  "strategies/jetpack/jetpack.thruster.ts"
  "abstract/base-fsm.ts"
  "contracts/ibase-fsm.ts"
)

echo "Creando estructura en ${ROOT} ..."

for relpath in "${FILES[@]}"; do
  fullpath="${ROOT}/${relpath}"
  dir=$(dirname "$fullpath")
  mkdir -p "$dir"

  if [ -f "$fullpath" ]; then
    echo "  ya existe, no se pisa: $fullpath"
    continue
  fi

  printf "// %s\n" "$fullpath" > "$fullpath"
  echo "  creado: $fullpath"
done

# poc3.md aparte, en la raíz del poc (no se pisa si ya lo copiaste manualmente)
if [ ! -f "${ROOT}/poc3.md" ]; then
  touch "${ROOT}/poc3.md"
  echo "  creado (vacío): ${ROOT}/poc3.md  -> pegar ahí el contenido del borrador"
fi

echo "Listo."