# Diseño — Modo "Práctica con pistas" (contador 20s → hint + 50/50)

- **Fecha:** 2026-06-17
- **Proyecto:** examen-clase-b (simulador examen teórico Clase B, Chile)
- **Estado:** Aprobado (pendiente de plan de implementación)

## 1. Contexto y objetivo

La app tiene hoy dos modos: **Examen** (35 preguntas cronometradas a 45:00, sin
ayudas, simula el test real Nexteo) y **Modo estudio** (recorre el banco con
feedback inmediato y filtro por categoría).

El objetivo es agregar un **tercer modo, "Práctica con pistas"**, donde cada
pregunta muestra **sobre el enunciado un contador de 20 segundos**; al llegar a 0
aparece una **pista de texto** y, además, se **descarta una alternativa
incorrecta** (mecánica tipo comodín). El contador es visible para que la persona
entienda que la pista llega después de ese tiempo. El Examen y el Modo estudio
**no se modifican**.

## 2. Decisiones tomadas (brainstorming)

1. **Modo nuevo e independiente** "Práctica con pistas" (no se toca Examen ni Estudio).
2. **Comportamiento = Modo estudio + pistas:** feedback inmediato al responder
   (correcta/incorrecta + explicación + cita del Libro CONASET), navegación
   Anterior/Siguiente, filtro por categoría, **sin puntaje final**.
3. **Pista híbrida a los 20s:** pista de **texto** (campo nuevo por pregunta) **+
   descarte de 1 alternativa incorrecta**.
4. **Contador visible sobre la pregunta** (cuenta regresiva 20 → 0).
5. **Arquitectura: enfoque A** — pantalla y controlador propios para Práctica,
   reutilizando piezas existentes; Examen y Estudio intactos.

## 3. Arquitectura (enfoque A)

Pantalla y controlador de "Práctica" **propios y autocontenidos**, que reutilizan
las funciones ya existentes y probadas:

- `renderQuestionCard(q, opts)` — render de la tarjeta de pregunta (ya soporta
  `reveal` para feedback y `bookRefEl` para la cita).
- `shuffleOptions(options, correctIndex)` — baraja alternativas recalculando el índice.
- El constructor del `<select>` de categorías (hoy `buildStudyCategoryOptions`) se
  **generaliza** a una función reutilizable (p. ej. `buildCategoryOptions(selectEl)`)
  para no duplicar la lista de categorías entre Estudio y Práctica.

El estado de Práctica vive en su propio objeto (`practice = { pool, current }`),
análogo a `study`, sin tocar el objeto `study`. Razón: cada modo se entiende y se
prueba por separado; riesgo de regresión sobre el Estudio/Examen ≈ nulo.

## 4. Modelo de datos — campo `hint`

Se agrega a **cada una de las 167 preguntas** de `questions.json`:

```json
"hint": "<pista que orienta hacia la respuesta SIN revelar la alternativa>"
```

- **Generación:** mediante un workflow por categoría (igual patrón que las citas
  del libro), apoyándose en `explanation`/`bookQuote` para orientar, pero
  reformulando para no delatar la opción correcta.
- **Compuerta anti-spoiler (determinista, en Python):** se rechaza toda pista que
  contenga (normalizado: minúsculas, sin tildes/espacios extra) el texto de la
  alternativa correcta o una coincidencia de tokens ≥ ~0,8 con ella. Las pistas
  rechazadas se reescriben; si aun así no se logra una buena pista específica, se
  usa un **fallback genérico** por categoría (p. ej. "Relee el enunciado y descarta
  las opciones extremas"). Nunca se publica una pista que delate la respuesta.
- Todas las preguntas tendrán `hint` no vacío (específico o fallback), de modo que
  el modo funcione en las 167.

## 5. Entrada al modo

Tercer botón en la pantalla de inicio: **"🎯 Práctica con pistas"**, junto a
*Comenzar examen* y *Modo estudio*.

- Móvil: los botones se apilan (ya es el comportamiento actual).
- Escritorio: la fila de acciones se ajusta para 3 botones de forma equilibrada.

## 6. UX de la pantalla de práctica

```
┌─────────────────────────────────────────┐
│  ⏳ Pista en 0:14   [▓▓▓▓▓▓░░░░░░]        │  ← barra sobre la pregunta
├─────────────────────────────────────────┤
│  VELOCIDAD                                │
│  ¿Cuál es la velocidad máxima urbana?     │
│  (A) 60   (B) 50   (C) 40   (D) 80        │
└─────────────────────────────────────────┘
```

- El contador (20s) y su barra se muestran **sobre la tarjeta de la pregunta**.
- **Al llegar a 0:**
  - La zona del contador pasa a mostrar **💡 Pista: \<texto del `hint`\>**.
  - Se **atenúa y deshabilita 1 alternativa incorrecta** (elegida al azar entre las
    incorrectas), reduciendo de 4 a 3 opciones. Se descarta **una** (no dos) porque
    ya hay pista de texto; evitar trivializar.
- **Al responder** (en cualquier momento, antes o después de la pista): feedback
  inmediato — marca correcta/incorrecta, muestra explicación y la cita del libro
  (reutiliza `reveal` de `renderQuestionCard`), igual que en Estudio.
- **Sin botón "ver pista ahora":** la espera de 20s es intencional.
- **Sin puntaje final:** es práctica; el valor está en el feedback por pregunta.
- **Filtro por categoría** y **Anterior/Siguiente** reutilizados del patrón de Estudio.

## 7. Lógica de contador y estado

- Contador **por pregunta**, 20s, mediante un único `setInterval` activo a la vez.
- **Arranca** al mostrar una pregunta no respondida y sin pista aún revelada.
- **Se reinicia a 20s** al navegar a otra pregunta.
- **Se detiene** (clearInterval) al responder, al revelar la pista, al cambiar de
  categoría, y al salir del modo (volver al inicio). No quedan temporizadores colgados.
- **Estado por pregunta** (en el objeto de la pregunta del pool de práctica):
  `chosen` (índice elegido o null), `hintShown` (bool), `eliminated` (índice de la
  alternativa descartada o null).
- Al **volver** a una pregunta ya respondida o con pista mostrada, se renderiza su
  estado revelado (no se reinicia el contador ni se re-descarta otra opción).

## 8. Accesibilidad

- El display de segundos **no** usa `aria-live` por-segundo (evita spam al lector
  de pantalla). Al aparecer la pista se anuncia una sola vez ("Pista disponible") en
  una región `aria-live="polite"`.
- La alternativa descartada queda `aria-disabled="true"`, fuera del orden de
  tabulación, y visualmente atenuada (no solo color: también opacidad/tachado, para
  no depender del color).
- Foco gestionado igual que el resto de pantallas (encabezado al entrar al modo).

## 9. Verificación

- **Compuerta anti-spoiler** (Python): ninguna `hint` contiene el texto de la
  opción correcta (substring normalizado / solapamiento de tokens).
- **Validación estructural** de `questions.json`: las 167 mantienen su esquema y
  todas tienen `hint` no vacío.
- **Tests de invariantes del flujo de práctica** (en navegador): el contador llega a
  0 → aparece la pista + se descarta exactamente 1 alternativa incorrecta (nunca la
  correcta); responder antes o después funciona; navegar reinicia el contador; el
  filtro por categoría recarga el pool; no quedan `setInterval` activos al salir.
- **Pruebas visuales** en móvil y escritorio (preview), y verificación de que
  Examen y Modo estudio siguen funcionando igual (sin regresión).

## 10. Fuera de alcance (YAGNI)

- No se modifica el Examen ni el Modo estudio.
- Sin puntaje, ranking ni persistencia del progreso de práctica.
- Sin botón de revelar pista anticipadamente.
- Sin configurar la duración del contador (fijo en 20s).

## 11. Archivos afectados

- `questions.json` — nuevo campo `hint` en las 167 preguntas.
- `index.html` — tercer botón en inicio + nueva sección/pantalla de práctica
  (barra de contador, host de pregunta, nav, filtro) y región `aria-live`.
- `styles.css` — estilos de la barra de contador, estado de pista y alternativa
  descartada; ajuste de la fila de 3 botones en escritorio.
- `app.js` — controlador de práctica (pool, navegación, contador, revelado de
  pista + 50/50), generalización del constructor de categorías, wiring del botón.
- Scripts temporales de generación/verificación de `hint` (no se commitean).
