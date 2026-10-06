# ¡Fakeado! Fallas · Mentiras y verdades falleras

Juego de preguntas y faroles para móviles (Android e iOS), tablets y PC. Cada jugador inventa una respuesta falsa, todos votan cuál es la verdadera y se gana engañando a los demás.

- **Multimóvil:** salas con código de 4 letras y QR (Firebase Realtime Database + acceso anónimo).
- **Un solo móvil:** modo "pasa el móvil" sin internet.
- **Peques (6-8):** eligen entre 3 mentiras sin escribir; las preguntas se adaptan al más pequeño.
- **Contenido:** 561 preguntas sobre las Fallas de València en 11 temas (`src/data/raw/` y `src/data/historia.json`), 205 en la versión gratis, más las de «La meua falla».
- **Compra única:** `fallas_todo`, 0,99 €, desbloquea todo para la sala del anfitrión.

**Para publicar, sigue [GUIA.md](GUIA.md).** Textos y capturas de las tiendas en `store/`.

## Desarrollo
```
npm install
cp .env.example .env   # valores de Firebase
npm run dev            # juego en http://localhost:5173
npm test               # pruebas (motor, partida online simulada e interfaz)
npm run build          # valida preguntas, comprueba tipos y compila
npx cap sync           # copia la web a los proyectos android/ e ios/
```

Estructura: `src/engine` (reglas y puntuación, sin dependencias), `src/net` (Firebase y modo local), `src/ui` + `src/App.tsx` (pantallas), `scripts/build-questions.ts` (valida y compila el banco de preguntas).
