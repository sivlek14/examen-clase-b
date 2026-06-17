/* ===========================================================
   Examen de práctica — Licencia Clase B (Chile)
   Lógica del simulador. Vanilla JS, sin dependencias.
   =========================================================== */
(function () {
  "use strict";

  // ---------- Constantes ----------
  var LETTERS = ["A", "B", "C", "D"];
  var BEST_SCORE_KEY = "examenClaseB.bestScore";
  var HISTORY_KEY = "examenClaseB.history";
  var HISTORY_MAX = 10;
  var PRACTICE_HINT_SEC = 20;

  // ---------- Estado global de la app ----------
  var DATA = null;        // questions.json completo
  var CONFIG = null;      // examConfig
  var BANK = [];          // banco de preguntas

  // Estado del examen en curso (sólo en memoria, NO en storage)
  var exam = null;
  var study = null;

  // ---------- Utilidades DOM ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function showScreen(id) {
    var screens = document.querySelectorAll(".screen");
    for (var i = 0; i < screens.length; i++) {
      screens[i].hidden = screens[i].id !== id;
    }
    window.scrollTo(0, 0);
    // Lleva el foco de teclado al encabezado de la nueva pantalla
    // para que usuarios de teclado/lector de pantalla no pierdan el lugar.
    var target = document.getElementById(id);
    var heading = target && target.querySelector("h1, h2");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      try { heading.focus({ preventScroll: true }); } catch (e) { heading.focus(); }
    }
  }

  // ---------- Mezcla (Fisher–Yates) ----------
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* Baraja las 4 alternativas y recalcula el índice correcto. */
  function shuffleOptions(options, correctIndex) {
    var tagged = options.map(function (text, i) {
      return { text: text, isCorrect: i === correctIndex };
    });
    var mixed = shuffle(tagged);
    var newIndex = -1;
    for (var i = 0; i < mixed.length; i++) {
      if (mixed[i].isCorrect) { newIndex = i; break; }
    }
    return { options: mixed.map(function (o) { return o.text; }), correctIndex: newIndex };
  }

  // ---------- Armado del examen ----------
  /*
     1. Designa 3 preguntas de doble puntaje: una de cada categoría crítica
        (alcohol, velocidad, retencion_infantil) entre las doublePointEligible.
        Si faltara alguna, completa con otra elegible.
     2. Completa hasta 35 con preguntas al azar del resto del banco.
     3. Baraja el orden de las 35 y baraja las alternativas de cada una.
  */
  function buildExam() {
    var total = CONFIG.totalQuestions;
    var doubleCount = CONFIG.doublePointCount;
    var critical = CONFIG.doublePointCategories;

    var usedIds = {};
    var doubles = [];

    // (a) una elegible por cada categoría crítica
    critical.forEach(function (cat) {
      if (doubles.length >= doubleCount) return;
      var pool = shuffle(BANK.filter(function (q) {
        return q.doublePointEligible && q.category === cat && !usedIds[q.id];
      }));
      if (pool.length) { doubles.push(pool[0]); usedIds[pool[0].id] = true; }
    });

    // (b) si faltan, completa con cualquier elegible
    if (doubles.length < doubleCount) {
      var extra = shuffle(BANK.filter(function (q) {
        return q.doublePointEligible && !usedIds[q.id];
      }));
      for (var i = 0; i < extra.length && doubles.length < doubleCount; i++) {
        doubles.push(extra[i]); usedIds[extra[i].id] = true;
      }
    }

    var doubleIds = {};
    doubles.forEach(function (q) { doubleIds[q.id] = true; });

    // (c) rellena hasta el total con el resto del banco
    var fillNeeded = total - doubles.length;
    var rest = shuffle(BANK.filter(function (q) { return !usedIds[q.id]; })).slice(0, fillNeeded);

    // (d) baraja el orden final y baraja alternativas
    var selected = shuffle(doubles.concat(rest));

    var questions = selected.map(function (q) {
      var mixed = shuffleOptions(q.options, q.correctIndex);
      var isDouble = !!doubleIds[q.id];
      return {
        id: q.id,
        category: q.category,
        categoryLabel: q.categoryLabel,
        question: q.question,
        explanation: q.explanation || "",
        bookPage: q.bookPage || null,
        bookQuote: q.bookQuote || "",
        options: mixed.options,
        correctIndex: mixed.correctIndex,
        isDouble: isDouble,
        points: isDouble ? 2 : 1
      };
    });

    return {
      questions: questions,
      answers: questions.map(function () { return null; }),  // índice elegido o null
      flagged: questions.map(function () { return false; }),
      current: 0,
      durationSec: CONFIG.timeLimitMinutes * 60,
      remainingSec: CONFIG.timeLimitMinutes * 60,
      timerId: null,
      finished: false,
      startedAt: Date.now()
    };
  }

  // ---------- Render: una pregunta como tarjeta ----------
  /*
     opts.reveal  -> muestra correcta/incorrecta y explicación (modo estudio/revisión)
     opts.name    -> name del grupo de radios
     opts.onPick  -> callback(index)
     opts.selected-> índice marcado
  */
  function renderQuestionCard(q, opts) {
    opts = opts || {};
    var card = el("div", "qcard");

    var top = el("div", "qcard__top");
    top.appendChild(el("span", "qtag", q.categoryLabel));
    if (q.isDouble) {
      var badge = el("span", "badge-double", "DOBLE PUNTAJE ×2");
      badge.setAttribute("aria-label", "Pregunta de doble puntaje, vale 2 puntos");
      top.appendChild(badge);
    }
    card.appendChild(top);

    var fieldset = el("fieldset", "options");
    var legend = el("legend", "qtext");
    legend.innerHTML = renderInline(q.question);
    fieldset.appendChild(legend);

    q.options.forEach(function (optText, idx) {
      var label = el("label", "option");
      var input = document.createElement("input");
      input.type = "radio";
      input.name = opts.name || "q";
      input.value = String(idx);
      if (opts.selected === idx) input.checked = true;
      if (opts.reveal) input.disabled = true;

      var mark = el("span", "option__mark");
      var letter = el("span", "option__letter", LETTERS[idx] + ")");
      var text = el("span", "option__text", optText);

      // Estados revelados
      if (opts.reveal) {
        if (idx === q.correctIndex) {
          label.classList.add("option--correct");
          mark.textContent = "✓";
        } else if (opts.selected === idx) {
          label.classList.add("option--wrong");
          mark.textContent = "✕";
        }
      }

      if (opts.eliminated === idx) {
        label.classList.add("option--eliminated");
        input.disabled = true;
        input.setAttribute("aria-disabled", "true");
        input.tabIndex = -1;
      }

      label.appendChild(input);
      label.appendChild(mark);
      label.appendChild(letter);
      label.appendChild(text);

      if (!opts.reveal && typeof opts.onPick === "function") {
        input.addEventListener("change", function () { opts.onPick(idx); });
      }
      fieldset.appendChild(label);
    });

    card.appendChild(fieldset);

    if (opts.reveal && q.explanation) {
      var exp = el("div", "explanation");
      exp.innerHTML = "<strong>Explicación:</strong> " + escapeHtml(q.explanation);
      card.appendChild(exp);
    }
    if (opts.reveal) card.appendChild(bookRefEl(q));

    return card;
  }

  // Bloque de referencia al Libro oficial: página + extracto que confirma la
  // respuesta cuando existe en el libro; si no, una nota honesta de fundamento.
  function bookRefEl(q) {
    if (q.bookPage) {
      var ref = el("div", "book-ref");
      ref.appendChild(el("div", "book-ref__src",
        "📖 Libro para la Conducción en Chile (CONASET) · pág. " + q.bookPage));
      if (q.bookQuote) {
        var quote = el("blockquote", "book-ref__quote", "«" + q.bookQuote + "»");
        ref.appendChild(quote);
      }
      return ref;
    }
    var gap = el("div", "book-ref book-ref--gap");
    gap.appendChild(el("div", "book-ref__src", "📖 Sin cita textual en el Libro CONASET"));
    gap.appendChild(el("div", "book-ref__note",
      "Este punto se fundamenta en la Ley de Tránsito 18.290 y normas asociadas; el Libro para la Conducción no lo trata como cita textual."));
    return gap;
  }

  // Convierte **negrita** del texto del banco a <strong> de forma segura
  function renderInline(text) {
    return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // =========================================================
  //  EXAMEN
  // =========================================================
  function startExam() {
    exam = buildExam();
    renderExamQuestion();
    startTimer();
    showScreen("screen-exam");
  }

  function renderExamQuestion() {
    var q = exam.questions[exam.current];
    var host = $("#question-host");
    host.innerHTML = "";
    host.appendChild(renderQuestionCard(q, {
      name: "exam-q-" + exam.current,
      selected: exam.answers[exam.current],
      onPick: function (idx) {
        exam.answers[exam.current] = idx;
        updateExamChrome();
      }
    }));
    updateExamChrome();
  }

  function updateExamChrome() {
    $("#exam-current").textContent = String(exam.current + 1);
    $("#exam-total").textContent = String(exam.questions.length);
    var answered = exam.answers.filter(function (a) { return a !== null; }).length;
    $("#exam-progressbar-fill").style.width =
      (answered / exam.questions.length * 100) + "%";

    $("#btn-prev").disabled = exam.current === 0;
    $("#btn-next").disabled = exam.current === exam.questions.length - 1;

    var flagBtn = $("#btn-flag");
    var isFlagged = exam.flagged[exam.current];
    flagBtn.setAttribute("aria-pressed", isFlagged ? "true" : "false");
    flagBtn.textContent = isFlagged ? "⚑ Marcada" : "⚑ Marcar";
  }

  function gotoQuestion(idx) {
    if (idx < 0 || idx >= exam.questions.length) return;
    exam.current = idx;
    renderExamQuestion();
  }

  // ---------- Temporizador ----------
  function startTimer() {
    renderTimer();
    exam.timerId = setInterval(function () {
      exam.remainingSec--;
      if (exam.remainingSec <= 0) {
        exam.remainingSec = 0;
        renderTimer();
        stopTimer();
        announce("Tiempo agotado. El examen se envió automáticamente.");
        finishExam(true); // autoenvío
        return;
      }
      renderTimer();
    }, 1000);
  }
  function stopTimer() {
    if (exam && exam.timerId) { clearInterval(exam.timerId); exam.timerId = null; }
  }
  function renderTimer() {
    var s = exam.remainingSec;
    var m = Math.floor(s / 60);
    var sec = s % 60;
    var node = $("#exam-timer");
    node.textContent = pad2(m) + ":" + pad2(sec);
    node.classList.toggle("danger", s <= 60);
    node.classList.toggle("warning", s > 60 && s <= 300); // últimos 5 min
    // Anuncios para lectores de pantalla en hitos exactos (el cronómetro
    // visual no es accesible por sí solo; aria-live del display está en "off").
    if (s === 300) announce("Quedan 5 minutos.");
    else if (s === 60) announce("Queda 1 minuto.");
  }
  function announce(msg) {
    var node = $("#timer-announce");
    if (node) node.textContent = msg;
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  // ---------- Mapa de preguntas ----------
  function openMap() {
    var grid = $("#map-grid");
    grid.innerHTML = "";
    exam.questions.forEach(function (q, i) {
      var cell = el("button", "map-cell", String(i + 1));
      cell.type = "button";
      if (exam.answers[i] !== null) cell.classList.add("answered");
      if (exam.flagged[i]) cell.classList.add("flagged");
      if (i === exam.current) cell.classList.add("current");
      var stateTxt = exam.answers[i] !== null ? "respondida" : "sin responder";
      if (exam.flagged[i]) stateTxt += ", marcada";
      cell.setAttribute("aria-label", "Pregunta " + (i + 1) + ", " + stateTxt);
      cell.addEventListener("click", function () {
        closeModal("map");
        gotoQuestion(i);
      });
      grid.appendChild(cell);
    });
    openModal("map");
  }

  // ---------- Finalizar ----------
  function confirmFinish() {
    var unanswered = exam.answers.filter(function (a) { return a === null; }).length;
    var txt = $("#confirm-text");
    if (unanswered > 0) {
      txt.innerHTML = "Te quedan <strong>" + unanswered +
        "</strong> pregunta(s) sin responder. Una vez finalizado no podrás volver atrás.";
    } else {
      txt.textContent = "Respondiste las 35 preguntas. Una vez finalizado no podrás volver atrás.";
    }
    openModal("confirm");
  }

  function finishExam(auto) {
    if (!exam || exam.finished) return; // idempotente: nunca puntuar dos veces
    stopTimer();
    closeModal("confirm");
    closeModal("map");
    exam.finished = true;
    exam.autoSubmitted = !!auto;
    renderResults();
    showScreen("screen-results");
  }

  // =========================================================
  //  RESULTADOS
  // =========================================================
  function renderResults() {
    var maxScore = CONFIG.maxScore;
    var passScore = CONFIG.passScore;

    var score = 0;
    var correctCount = 0;
    var doubleCorrect = 0;
    var byCat = {};

    exam.questions.forEach(function (q, i) {
      if (!byCat[q.category]) byCat[q.category] = { label: q.categoryLabel, ok: 0, total: 0 };
      byCat[q.category].total++;
      var isOk = exam.answers[i] === q.correctIndex;
      if (isOk) {
        score += q.points;
        correctCount++;
        if (q.isDouble) doubleCorrect++;
        byCat[q.category].ok++;
      }
    });

    var passed = score >= passScore;

    // --- Tarjeta de veredicto ---
    var vcard = $("#verdict-card");
    vcard.classList.toggle("verdict--pass", passed);
    vcard.classList.toggle("verdict--fail", !passed);
    $("#verdict-label").textContent = passed ? "✓ APROBADO" : "✗ REPROBADO";
    $("#verdict-score").textContent = String(score);

    var usedSec = exam.durationSec - exam.remainingSec;
    var meta =
      "Tiempo utilizado: " + formatDuration(usedSec) +
      (exam.autoSubmitted ? " (tiempo agotado)" : "") +
      " · Aciertos: " + correctCount + " / " + exam.questions.length +
      " · Dobles acertadas: " + doubleCorrect + " / " + CONFIG.doublePointCount +
      " · Umbral de aprobación: " + passScore + " / " + maxScore;
    $("#verdict-meta").textContent = meta;

    // --- Desglose por categoría ---
    var bd = $("#category-breakdown");
    bd.innerHTML = "";
    Object.keys(byCat).sort(function (a, b) {
      return byCat[b].total - byCat[a].total || byCat[a].label.localeCompare(byCat[b].label);
    }).forEach(function (cat) {
      var c = byCat[cat];
      var pct = Math.round(c.ok / c.total * 100);
      var row = el("div", "bd-row");
      row.appendChild(el("span", "bd-row__label", c.label));
      row.appendChild(el("span", "bd-row__val", c.ok + " / " + c.total));
      var bar = el("div", "bd-row__bar");
      var fill = el("i");
      fill.style.width = pct + "%";
      if (pct < 50) fill.classList.add("bad");
      else if (pct < 80) fill.classList.add("low");
      bar.appendChild(fill);
      row.appendChild(bar);
      bd.appendChild(row);
    });

    // --- Revisión pregunta por pregunta ---
    var list = $("#review-list");
    list.innerHTML = "";
    exam.questions.forEach(function (q, i) {
      var chosen = exam.answers[i];
      var isOk = chosen === q.correctIndex;

      var item = el("div", "review-item");
      var head = el("div", "review-item__head");
      var n = el("span", "review-item__n " + (isOk ? "review-item__n--ok" : "review-item__n--no"),
        isOk ? "✓" : "✗");
      head.appendChild(n);
      var qh = el("span", "review-item__q");
      qh.innerHTML = (i + 1) + ". " + renderInline(q.question) +
        (q.isDouble ? ' <span class="badge-double">×2</span>' : "");
      head.appendChild(qh);
      item.appendChild(head);

      q.options.forEach(function (optText, idx) {
        var isCorrect = idx === q.correctIndex;
        var isChosen = idx === chosen;
        if (!isCorrect && !isChosen) return; // mostrar solo correcta + la elegida
        var ro = el("div", "review-opt");
        var icon = el("span", "review-opt__icon");
        if (isCorrect) {
          ro.classList.add("review-opt--correct");
          icon.textContent = "✓";
        } else {
          ro.classList.add("review-opt--chosen-wrong");
          icon.textContent = "✕";
        }
        ro.appendChild(icon);
        var label = LETTERS[idx] + ") " + optText +
          (isCorrect ? "  — Respuesta correcta" : "  — Tu respuesta");
        ro.appendChild(el("span", "review-opt__text", label));
        item.appendChild(ro);
      });

      if (chosen === null) {
        var nores = el("div", "review-opt review-opt--chosen-wrong");
        nores.appendChild(el("span", "review-opt__icon", "—"));
        nores.appendChild(el("span", "review-opt__text", "No respondiste esta pregunta."));
        item.appendChild(nores);
      }

      if (q.explanation) {
        var exp = el("div", "explanation");
        exp.innerHTML = "<strong>Explicación:</strong> " + escapeHtml(q.explanation);
        item.appendChild(exp);
      }
      item.appendChild(bookRefEl(q));
      list.appendChild(item);
    });

    saveBestScore(score);
    saveHistoryEntry({
      ts: Date.now(),
      score: score,
      max: maxScore,
      passed: passed,
      correct: correctCount,
      total: exam.questions.length,
      usedSec: usedSec,
      doubleCorrect: doubleCorrect,
      auto: !!exam.autoSubmitted
    });
    renderHistory();
  }

  function formatDuration(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + " min " + pad2(s) + " s";
  }

  // ---------- Mejor puntaje (localStorage) ----------
  function saveBestScore(score) {
    try {
      var prev = parseInt(localStorage.getItem(BEST_SCORE_KEY) || "0", 10);
      if (isNaN(prev) || score > prev) {
        localStorage.setItem(BEST_SCORE_KEY, String(score));
      }
    } catch (e) { /* storage no disponible: ignorar */ }
  }
  function loadBestScore() {
    try {
      var v = parseInt(localStorage.getItem(BEST_SCORE_KEY) || "", 10);
      return isNaN(v) ? null : v;
    } catch (e) { return null; }
  }
  function renderBestScore() {
    var best = loadBestScore();
    var box = $("#best-score");
    if (best === null) { box.hidden = true; return; }
    $("#best-score-value").textContent = String(best);
    box.hidden = false;
  }

  // ---------- Historial de exámenes (localStorage, últimos 10) ----------
  function loadHistory() {
    try {
      var arr = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveHistoryEntry(entry) {
    try {
      var arr = loadHistory();
      arr.unshift(entry);                       // más reciente primero
      if (arr.length > HISTORY_MAX) arr = arr.slice(0, HISTORY_MAX);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(arr));
    } catch (e) { /* storage no disponible: ignorar */ }
  }
  function clearHistory() {
    try { localStorage.removeItem(HISTORY_KEY); } catch (e) { /* ignorar */ }
    renderHistory();
  }
  function formatHistDate(ts) {
    try {
      var d = new Date(ts);
      return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" }) +
        " · " + d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
    } catch (e) { return ""; }
  }
  function renderHistory() {
    var box = $("#history");
    var list = $("#history-list");
    var hist = loadHistory();
    list.innerHTML = "";
    if (!hist.length) { box.hidden = true; return; }
    hist.forEach(function (h) {
      var max = h.max || CONFIG.maxScore;
      var item = el("li", "hist-item " + (h.passed ? "hist-item--pass" : "hist-item--fail"));

      var main = el("div", "hist-item__main");
      var score = el("span", "hist-item__score", h.score + " / " + max);
      var verdict = el("span", "hist-item__verdict", h.passed ? "Aprobado" : "Reprobado");
      main.appendChild(score);
      main.appendChild(verdict);

      var meta = el("div", "hist-item__meta");
      var bits = formatHistDate(h.ts);
      if (typeof h.correct === "number" && h.total) bits += " · " + h.correct + "/" + h.total + " aciertos";
      if (typeof h.usedSec === "number") bits += " · " + formatDuration(h.usedSec);
      if (h.auto) bits += " · (tiempo agotado)";
      meta.textContent = bits;

      item.appendChild(main);
      item.appendChild(meta);
      list.appendChild(item);
    });
    box.hidden = false;
  }

  // =========================================================
  //  MODO ESTUDIO
  // =========================================================
  function startStudy() {
    buildCategoryOptions($("#study-category"));
    study = { pool: [], current: 0 };
    loadStudyPool("all");
    showScreen("screen-study");
  }

  function buildCategoryOptions(sel) {
    if (sel.dataset.ready) return;
    sel.appendChild(new Option("Todas las categorías", "all"));
    var seen = {};
    BANK.forEach(function (q) {
      if (!seen[q.category]) {
        seen[q.category] = true;
        sel.appendChild(new Option(q.categoryLabel, q.category));
      }
    });
    sel.dataset.ready = "1";
  }

  // =========================================================
  //  MODO PRÁCTICA CON PISTAS
  // =========================================================
  var practice = null;

  function startPractice() {
    buildCategoryOptions($("#practice-category"));
    practice = { pool: [], current: 0, timerId: null };
    loadPracticePool("all");
    showScreen("screen-practice");
  }

  function loadPracticePool(category) {
    var src = category === "all" ? BANK : BANK.filter(function (q) { return q.category === category; });
    practice.pool = shuffle(src).map(function (q) {
      var mixed = shuffleOptions(q.options, q.correctIndex);
      return {
        id: q.id, category: q.category, categoryLabel: q.categoryLabel,
        question: q.question, explanation: q.explanation || "",
        bookPage: q.bookPage || null, bookQuote: q.bookQuote || "", hint: q.hint || "",
        options: mixed.options, correctIndex: mixed.correctIndex, isDouble: false,
        chosen: null, hintShown: false, eliminated: null
      };
    });
    practice.current = 0;
    renderPracticeQuestion();
  }

  function renderPracticeQuestion() {
    stopPracticeTimer();
    var host = $("#practice-host");
    host.innerHTML = "";
    if (!practice.pool.length) {
      host.appendChild(el("p", "muted", "No hay preguntas en esta categoría."));
      $("#practice-counter").textContent = "";
      return;
    }
    var q = practice.pool[practice.current];
    $("#practice-counter").textContent = "Pregunta " + (practice.current + 1) + " de " + practice.pool.length;

    if (q.chosen === null || q.hintShown) host.appendChild(buildHintBar(q));
    host.appendChild(renderQuestionCard(q, {
      name: "practice-q-" + practice.current,
      selected: q.chosen,
      reveal: q.chosen !== null,
      eliminated: q.hintShown ? q.eliminated : null,
      onPick: function (idx) { q.chosen = idx; stopPracticeTimer(); renderPracticeQuestion(); }
    }));

    $("#btn-practice-prev").disabled = practice.current === 0;
    $("#btn-practice-next").disabled = practice.current === practice.pool.length - 1;

    if (q.chosen === null && !q.hintShown) startPracticeCountdown(q);
  }

  function stopPracticeTimer() {
    if (practice && practice.timerId) { clearInterval(practice.timerId); practice.timerId = null; }
  }

  // Construye la barra sobre la pregunta: muestra el contador o, si ya se reveló,
  // la pista. revealHint() (Task 5) se encarga del estado revelado.
  function buildHintBar(q) {
    var bar = el("div", "hint-bar");
    bar.id = "practice-hint-bar";
    if (q.hintShown) {
      bar.classList.add("hint-bar--revealed");
      bar.appendChild(el("div", "hint-bar__hint", "💡 Pista: " + q.hint));
    } else {
      var txt = el("div", "hint-bar__text");
      txt.id = "practice-countdown-text";
      txt.textContent = "⏳ Pista en " + pad2(PRACTICE_HINT_SEC) + "s";
      var track = el("div", "hint-bar__track");
      var fill = el("i"); fill.id = "practice-countdown-fill"; fill.style.width = "100%";
      track.appendChild(fill);
      bar.appendChild(txt); bar.appendChild(track);
    }
    return bar;
  }

  function startPracticeCountdown(q) {
    var remaining = PRACTICE_HINT_SEC;
    practice.timerId = setInterval(function () {
      remaining--;
      if (remaining <= 0) { stopPracticeTimer(); revealHint(q); return; }
      var txt = $("#practice-countdown-text");
      var fill = $("#practice-countdown-fill");
      if (txt) txt.textContent = "⏳ Pista en " + pad2(remaining) + "s";
      if (fill) fill.style.width = (remaining / PRACTICE_HINT_SEC * 100) + "%";
    }, 1000);
  }

  function pickEliminated(q) {
    var wrong = [];
    q.options.forEach(function (_, i) { if (i !== q.correctIndex) wrong.push(i); });
    return shuffle(wrong)[0];
  }

  function announcePractice(msg) {
    var node = $("#practice-announce");
    if (node) node.textContent = msg;
  }

  function revealHint(q) {
    q.hintShown = true;
    q.eliminated = pickEliminated(q);
    announcePractice("Pista disponible.");
    renderPracticeQuestion();
  }

  function loadStudyPool(category) {
    var src = category === "all" ? BANK : BANK.filter(function (q) { return q.category === category; });
    study.pool = shuffle(src).map(function (q) {
      var mixed = shuffleOptions(q.options, q.correctIndex);
      return {
        id: q.id,
        category: q.category,
        categoryLabel: q.categoryLabel,
        question: q.question,
        explanation: q.explanation || "",
        bookPage: q.bookPage || null,
        bookQuote: q.bookQuote || "",
        options: mixed.options,
        correctIndex: mixed.correctIndex,
        isDouble: false,
        chosen: null
      };
    });
    study.current = 0;
    renderStudyQuestion();
  }

  function renderStudyQuestion() {
    var host = $("#study-host");
    host.innerHTML = "";
    if (!study.pool.length) {
      host.appendChild(el("p", "muted", "No hay preguntas en esta categoría."));
      $("#study-counter").textContent = "";
      return;
    }
    var q = study.pool[study.current];
    $("#study-counter").textContent = "Pregunta " + (study.current + 1) + " de " + study.pool.length;

    host.appendChild(renderQuestionCard(q, {
      name: "study-q-" + study.current,
      selected: q.chosen,
      reveal: q.chosen !== null,    // feedback inmediato una vez respondida
      onPick: function (idx) {
        q.chosen = idx;
        renderStudyQuestion();      // re-render para revelar
      }
    }));

    $("#btn-study-prev").disabled = study.current === 0;
    $("#btn-study-next").disabled = study.current === study.pool.length - 1;
  }

  // =========================================================
  //  MODALES
  // =========================================================
  var lastFocused = null;
  var FOCUSABLE = 'button, [href], select, input, textarea, [tabindex]:not([tabindex="-1"])';

  function openModal(name) {
    lastFocused = document.activeElement;
    var m = $("#" + name + "-modal");
    m.hidden = false;
    var panel = m.querySelector(".modal__panel");
    var first = m.querySelector("button, [href], select, input");
    (first || panel).focus();
    // Oculta el fondo a la tecnología de asistencia mientras el diálogo está abierto.
    setBackgroundInert(true);
    document.addEventListener("keydown", modalKeydown);
  }
  function closeModal(name) {
    var m = $("#" + name + "-modal");
    if (!m || m.hidden) return;
    m.hidden = true;
    if (!anyModalOpen()) {
      document.removeEventListener("keydown", modalKeydown);
      setBackgroundInert(false);
    }
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  }
  function anyModalOpen() {
    return !!document.querySelector(".modal:not([hidden])");
  }
  function setBackgroundInert(on) {
    ["#main", ".app-footer"].forEach(function (sel) {
      var node = document.querySelector(sel);
      if (!node) return;
      if (on) node.setAttribute("aria-hidden", "true");
      else node.removeAttribute("aria-hidden");
    });
  }
  function modalKeydown(e) {
    var open = document.querySelector(".modal:not([hidden])");
    if (!open) return;
    if (e.key === "Escape") {
      closeModal(open.id.replace("-modal", ""));
      return;
    }
    if (e.key !== "Tab") return;
    // Atrapa el foco dentro del panel del diálogo.
    var panel = open.querySelector(".modal__panel");
    var items = [].slice.call(panel.querySelectorAll(FOCUSABLE)).filter(function (n) {
      return n.offsetParent !== null || n === document.activeElement;
    });
    if (!items.length) { e.preventDefault(); panel.focus(); return; }
    var first = items[0], last = items[items.length - 1];
    var active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault(); first.focus();
    }
  }

  // =========================================================
  //  RESET / NAVEGACIÓN GLOBAL
  // =========================================================
  function goHome() {
    stopPracticeTimer();
    stopTimer();
    exam = null;
    renderBestScore();
    renderHistory();
    showScreen("screen-home");
  }

  // =========================================================
  //  CARGA DE DATOS + WIRING
  // =========================================================
  function bindEvents() {
    $("#btn-start-exam").addEventListener("click", startExam);
    $("#btn-start-study").addEventListener("click", startStudy);

    $("#btn-prev").addEventListener("click", function () { gotoQuestion(exam.current - 1); });
    $("#btn-next").addEventListener("click", function () { gotoQuestion(exam.current + 1); });
    $("#btn-flag").addEventListener("click", function () {
      exam.flagged[exam.current] = !exam.flagged[exam.current];
      updateExamChrome();
    });
    $("#btn-open-map").addEventListener("click", openMap);
    $("#btn-finish").addEventListener("click", confirmFinish);
    $("#btn-confirm-finish").addEventListener("click", function () { finishExam(false); });

    $("#btn-retry").addEventListener("click", startExam);
    $("#btn-home").addEventListener("click", goHome);
    $("#btn-clear-history").addEventListener("click", clearHistory);

    $("#btn-study-back").addEventListener("click", goHome);
    $("#btn-study-prev").addEventListener("click", function () {
      if (study.current > 0) { study.current--; renderStudyQuestion(); }
    });
    $("#btn-study-next").addEventListener("click", function () {
      if (study.current < study.pool.length - 1) { study.current++; renderStudyQuestion(); }
    });
    $("#study-category").addEventListener("change", function (e) { loadStudyPool(e.target.value); });

    $("#btn-start-practice").addEventListener("click", startPractice);
    $("#btn-practice-back").addEventListener("click", goHome);
    $("#practice-category").addEventListener("change", function (e) { loadPracticePool(e.target.value); });
    $("#btn-practice-prev").addEventListener("click", function () {
      if (practice.current > 0) { practice.current--; renderPracticeQuestion(); }
    });
    $("#btn-practice-next").addEventListener("click", function () {
      if (practice.current < practice.pool.length - 1) { practice.current++; renderPracticeQuestion(); }
    });

    // Cierre de modales por backdrop / botones [data-close]
    document.querySelectorAll("[data-close]").forEach(function (node) {
      node.addEventListener("click", function () { closeModal(node.getAttribute("data-close")); });
    });

    // Atajos de teclado durante el examen
    document.addEventListener("keydown", function (e) {
      if ($("#screen-exam").hidden || !exam) return;
      if (anyModalOpen()) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var tag = (e.target && e.target.tagName) || "";
      var inFormControl = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
      // No secuestrar las flechas cuando el foco está en una alternativa
      // (los radios usan ←/→ para navegar entre opciones de forma nativa).
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !inFormControl) {
        e.preventDefault();
        gotoQuestion(exam.current + (e.key === "ArrowRight" ? 1 : -1));
      } else if (/^[1-4]$/.test(e.key) && tag !== "SELECT") {
        var idx = parseInt(e.key, 10) - 1;
        var q = exam.questions[exam.current];
        if (idx < q.options.length) {
          e.preventDefault();
          exam.answers[exam.current] = idx;
          renderExamQuestion();
        }
      }
    });
  }

  function init() {
    bindEvents();
    var status = $("#load-status");
    status.textContent = "Cargando preguntas…";

    fetch("./questions.json", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data || typeof data.examConfig !== "object" ||
            !Array.isArray(data.questions) || data.questions.length === 0) {
          throw new Error("estructura inválida");
        }
        DATA = data;
        CONFIG = data.examConfig;
        BANK = data.questions;
        document.title = (data.meta && data.meta.title) || document.title;
        status.textContent = "";
        $("#btn-start-exam").disabled = false;
        $("#btn-start-study").disabled = false;
        $("#btn-start-practice").disabled = false;
        renderBestScore();
        renderHistory();
      })
      .catch(function (err) {
        status.classList.add("error");
        status.textContent =
          "No se pudieron cargar las preguntas (" + err.message +
          "). Si abriste el archivo directamente, usa un servidor local o el sitio publicado.";
        $("#btn-start-exam").disabled = true;
        $("#btn-start-study").disabled = true;
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
