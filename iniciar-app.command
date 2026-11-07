#!/bin/bash
# Abre el programa de escritorio. La primera vez instala lo necesario; si el proyecto está en Git, se actualiza solo.
cd "$(dirname "$0")"
if ! command -v npm >/dev/null 2>&1; then echo "Falta Node.js. Instálalo desde https://nodejs.org y vuelve a abrir este archivo."; read -n 1 -s -r -p "Pulsa una tecla para cerrar"; exit 1; fi
if [ -d .git ] && command -v git >/dev/null 2>&1; then echo "Buscando actualizaciones en Git…"; git pull --ff-only 2>&1 | tail -2 || true; fi
if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then echo "Instalando (solo la primera vez o si hay novedades)…"; npm install --no-audit --no-fund || exit 1; fi
exec npm start
