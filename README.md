# Examen de práctica — Licencia Clase B (Chile) 🚗

Simulador web del **examen teórico de la licencia de conducir Clase B** de Chile
(formato **Nexteo / CONASET**). App estática (HTML + CSS + JavaScript vanilla),
sin backend, sin build, sin dependencias externas.

**🔗 Sitio publicado:** https://sivlek14.github.io/examen-clase-b/

> ⚠️ **Material de estudio NO oficial.** Las preguntas reales del examen Nexteo son
> confidenciales y se sortean al azar de un banco de más de 1.000 preguntas.
> Estudia con el libro oficial: <https://mejoresconductores.conaset.cl>

## Características

- **35 preguntas al azar** de un banco de 80 (16 categorías), con alternativas barajadas.
- **3 preguntas de doble puntaje** (×2), una de cada categoría crítica cuando es posible:
  alcohol, velocidad y retención infantil. Marcadas con insignia **«DOBLE PUNTAJE ×2»**.
- **Temporizador de 45:00** en cuenta regresiva (cambia de color en los últimos 5 min)
  con **autoenvío** al llegar a 0.
- Navegación **Anterior / Siguiente**, **marcar para revisar** y **mapa de preguntas** (grilla 1–35).
- Pantalla de resultados: **puntaje X/38**, veredicto **APROBADO** (≥ 33) / **REPROBADO**,
  desglose por categoría y revisión pregunta por pregunta con respuesta correcta y explicación.
- **Modo estudio** opcional: sin temporizador, feedback inmediato y filtro por categoría.
- **Referencia al Libro CONASET** en cada pregunta: página y extracto textual que confirma la respuesta (revisión y modo estudio).
- Mejor puntaje histórico e **historial de los últimos 10 exámenes** guardados en `localStorage` (con opción de borrar).
- Mobile-first, responsive, accesible (navegable por teclado, foco visible, `aria-*`).

## Reglas del examen

| Parámetro | Valor |
|---|---|
| Preguntas por examen | 35 (al azar) |
| Tiempo límite | 45 minutos |
| Puntaje máximo | 38 puntos |
| Puntaje para aprobar | 33 puntos |
| Preguntas de doble puntaje | 3 (valen 2 puntos c/u) |

## Estructura

```
examen-clase-b/
├── index.html      # estructura + pantallas (inicio, examen, estudio, resultados)
├── styles.css      # estilos mobile-first
├── app.js          # lógica del examen
├── questions.json  # banco de 80 preguntas
├── .nojekyll       # evita el procesamiento Jekyll de GitHub Pages
└── README.md
```

## Uso local

Al usar `fetch('./questions.json')`, debe servirse por HTTP (no `file://`):

```bash
# Python 3
python3 -m http.server 8000
# luego abre http://localhost:8000
```

## Despliegue

Publicado con **GitHub Pages** (rama `main`, carpeta raíz). Tras cualquier cambio:

```bash
git add . && git commit -m "..." && git push
```

Pages se actualiza automáticamente en 1–2 minutos.

## Atajos de teclado (durante el examen)

- `←` / `→` — pregunta anterior / siguiente
- `1`–`4` — seleccionar alternativa A–D
- `Esc` — cerrar mapa o diálogo

---

Atribución: basado en la **Ley de Tránsito 18.290** y el **Libro para la Conducción en Chile (CONASET)**.
