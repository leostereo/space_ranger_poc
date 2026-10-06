#!/usr/bin/env bash
# Utilidades compartidas por los scripts de migración (setup.script-NNN.sh).
# Uso:  source "$(dirname "$0")/_lib.sh"   y luego   setup_begin "$0" ... setup_end
#
# Reglas del flujo de migraciones:
#   - Los scripts se aplican en orden numérico y una sola vez (queda registro en applied.log).
#   - Un script aplicado no se edita: los cambios nuevos van en el script siguiente.
#   - Los scripts crean/modifican código pero NO son la fuente de verdad: después de aplicarlos
#     la verdad es el repo. Por eso nunca sobrescriben archivos existentes.

SETUP_CONFLICTS=0

setup_begin() { # $1 = ruta del script ($0)
  SETUP_ID="$(basename "$1")"
  SETUP_DIR="$(cd "$(dirname "$1")" && pwd)"
  SETUP_LOG="$SETUP_DIR/applied.log"
  if [[ "$(basename "$PWD")" != "src" ]]; then
    echo "Error: ejecutá este script parado en la carpeta src (actual: $PWD)" >&2
    exit 1
  fi
  touch "$SETUP_LOG"
  if grep -qxF "$SETUP_ID" "$SETUP_LOG"; then
    echo "SKIP     $SETUP_ID ya fue aplicado"
    exit 0
  fi
  echo "==> Aplicando $SETUP_ID"
}

setup_requires() { # $1 = id del script que debe estar aplicado antes
  if ! grep -qxF "$1" "$SETUP_LOG"; then
    echo "Error: $SETUP_ID requiere que $1 esté aplicado antes" >&2
    exit 1
  fi
}

# Crea el archivo desde stdin. Si existe y es igual: SAME. Si existe y difiere: deja <path>.new
write_file() { # $1 = ruta relativa a src
  local path="$1" tmp
  tmp="$(mktemp)"
  cat > "$tmp"
  chmod 644 "$tmp"
  if [[ ! -e "$path" ]]; then
    mkdir -p "$(dirname "$path")"
    mv "$tmp" "$path"
    echo "CREATE   $path"
  elif diff -q <(tr -d '\r' < "$path") <(tr -d '\r' < "$tmp") > /dev/null; then
    rm -f "$tmp"
    echo "SAME     $path"
  else
    mv "$tmp" "$path.new"
    SETUP_CONFLICTS=$((SETUP_CONFLICTS + 1))
    echo "CONFLICT $path (existe y difiere; versión nueva en $path.new)"
  fi
}

move_file() { # $1 = origen, $2 = destino
  local from="$1" to="$2"
  if [[ -e "$from" && ! -e "$to" ]]; then
    mkdir -p "$(dirname "$to")"
    git mv "$from" "$to" 2>/dev/null || mv "$from" "$to"
    echo "MOVE     $from -> $to"
  elif [[ -e "$from" && -e "$to" ]]; then
    echo "WARN     $from y $to existen; revisar a mano"
  fi
}

# Reemplazo con sed -E (compatible GNU/BSD). Ignora archivos que no existen.
replace_in() { # $1 = expresión sed, resto = archivos
  local expr="$1" file
  shift
  for file in "$@"; do
    [[ -f "$file" ]] || continue
    sed -i.bak -E "$expr" "$file" && rm -f "$file.bak"
  done
}

# Crea la carpeta; si queda vacía le pone .gitkeep para que git la conserve.
keep_dir() { # $1 = carpeta
  mkdir -p "$1"
  if [[ -z "$(ls -A "$1")" ]]; then
    : > "$1/.gitkeep"
  fi
  echo "DIR      $1"
}

setup_end() {
  echo "$SETUP_ID" >> "$SETUP_LOG"
  if (( SETUP_CONFLICTS > 0 )); then
    echo "==> $SETUP_ID aplicado con $SETUP_CONFLICTS conflicto(s): revisá cada <archivo>.new (diff) y borralo."
  else
    echo "==> $SETUP_ID aplicado"
  fi
}

# ---- agregado por setup.script-003 ----
file_hash() { # sha256 del archivo ignorando saltos de línea CRLF
  if command -v sha256sum > /dev/null 2>&1; then
    tr -d '\r' < "$1" | sha256sum | cut -d' ' -f1
  else
    tr -d '\r' < "$1" | shasum -a 256 | cut -d' ' -f1
  fi
}

# Actualiza un archivo entregado por una migración anterior.
#   - no existe                    -> CREATE
#   - ya es igual al nuevo         -> SAME
#   - es igual a la versión previa -> UPDATE (nadie lo editó: se reemplaza)
#   - distinto (lo editaste)       -> CONFLICT: deja <path>.new
update_file() { # $1 = ruta, $2 = sha256 de la versión previa entregada
  local path="$1" previous_sha="$2" tmp
  tmp="$(mktemp)"
  cat > "$tmp"
  chmod 644 "$tmp"
  if [[ ! -e "$path" ]]; then
    mkdir -p "$(dirname "$path")"
    mv "$tmp" "$path"
    echo "CREATE   $path"
  elif diff -q <(tr -d '\r' < "$path") <(tr -d '\r' < "$tmp") > /dev/null; then
    rm -f "$tmp"
    echo "SAME     $path"
  elif [[ "$(file_hash "$path")" == "$previous_sha" ]]; then
    mv "$tmp" "$path"
    echo "UPDATE   $path"
  else
    mv "$tmp" "$path.new"
    SETUP_CONFLICTS=$((SETUP_CONFLICTS + 1))
    echo "CONFLICT $path (lo editaste; versión nueva en $path.new)"
  fi
}
