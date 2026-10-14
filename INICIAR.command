#!/bin/bash
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Instala Node.js (LTS) desde https://nodejs.org"; exit 1; }
[ -d node_modules ] || npm install
[ -f client/dist/index.html ] || npm run build
(sleep 4; open http://localhost:5000 2>/dev/null || xdg-open http://localhost:5000 2>/dev/null) &
npm start
