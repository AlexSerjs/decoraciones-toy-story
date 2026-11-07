#!/bin/bash
# Abre las herramientas en http://localhost:PUERTO (busca un puerto libre desde el 8000)
cd "$(dirname "$0")"
PY=$(command -v python3 || true)
if [ -z "$PY" ]; then echo "No encuentro python3. Instala las herramientas de línea de comandos de Apple (xcode-select --install) y vuelve a abrir este archivo."; read -n 1 -s -r -p "Pulsa una tecla para cerrar"; exit 1; fi
PORT=8000
while lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT+1)); done
echo "Abriendo http://localhost:$PORT  (cierra esta ventana para parar)"
( sleep 1; open "http://localhost:$PORT/decoraciones-toy-story.html" ) &
"$PY" -m http.server $PORT
