/**
 * Fixture: un trainer mínimo con la MISMA arquitectura que los seis reales.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Sirve para dos cosas:
 *   1. probar el extractor sin depender de 145 KB de HTML real;
 *   2. inyectar a propósito lo que un trainer real nunca tendrá — un
 *      `<script>` malicioso, un `onerror=`, un enlace `javascript:` — y
 *      comprobar que no llega al pack.
 */

export const MINI_TRAINER = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Mini Trainer</title>
<style>.rule{color:red}</style>
</head>
<body>
<nav>
  <button class="on" data-p="learn">📘 Learn</button>
  <button data-p="practice">🎯 Practice</button>
  <button data-p="plan">🗓️ Study Plan</button>
</nav>
<main>

<section id="learn" class="panel on">
  <div class="card"><h2>Everything on the exam</h2></div>

  <div class="topic open">
    <button onclick="this.parentNode.classList.toggle('open')">
      <span>🔤 1 · Present Simple <span class="tsub">— play / plays</span></span><span class="chev">▼</span>
    </button>
    <div class="body">
      <div class="rule">Use it for things that are <b>always true</b>.</div>
      <h3>1️⃣ The golden rule</h3>
      <table class="t">
        <tr><th>Subject</th><th>Verb</th></tr>
        <tr><td><b>He / She / It</b></td><td>verb <b>+ -s</b></td></tr>
        <tr><td></td><td>—</td></tr>
      </table>
      <div class="tip">Cross-check with <i>always</i>.</div>
      <div class="warn">Don't forget the <b>-s</b>.</div>
      <div class="steps">
        <div class="step"><span class="sn">1</span>Find the subject.</div>
        <div class="step"><span class="sn">2</span>Add the <b>-s</b>.</div>
      </div>
      <p>Fracción: <span class="f"><span class="a">3</span><span class="b">4</span></span> y cm<sup>2</sup>.</p>
      <div class="eg">Ejemplo con acentos: <b>corazón</b>, <b>ñandú</b>, ¿sí? 🌧️</div>
      <script>alert('inyectado en la leccion')</script>
      <img src=x onerror="alert(1)">
      <a href="javascript:alert(1)">no pulses</a>
    </div>
  </div>

  <div class="topic">
    <button><span>🗂️ 2 · Vocabulary</span><span class="chev">▼</span></button>
    <div class="body">
      <div class="rule">Learn 10 words a day.</div>
    </div>
  </div>
</section>

<section id="plan" class="panel">
  <div class="card">
    <h2>A 2-day plan</h2>
    <table class="t">
      <tr><th>Day</th><th>Focus</th><th>Target</th></tr>
      <tr><td><b>1</b></td><td>Read topic 1.</td><td>5 in a row</td></tr>
      <tr><td><b>2</b></td><td>Do the mock.</td><td>8 / 10</td></tr>
    </table>
    <div class="tip"><b>The night before:</b> sleep.</div>
  </div>
</section>

</main>
<script>
/* var BANK=[{c:"ps",q:"VIEJO",o:["x","y"],a:0}];  <- version antigua comentada */
var BANK=[
{c:"ps",q:"Alan ______ at the bank.",o:["work","works","working","is work"],a:1,e:"Alan = he → <b>works</b>."},
{c:"ps",q:"I ______ my face.",o:["washes","wash","washs","washes not"],a:1,e:"<b>I</b> nunca lleva -s."},
{c:"voc",q:"A ______ is furniture.",o:["sofa","river"],a:0,e:"Un sofá es un mueble."},
{c:"voc",q:"¿Cuál lleva tilde?",o:["corazón","corazon"],a:0,e:"Aguda acabada en <b>n</b> → tilde. 🅰️"}
];
var MPARTS=[{c:"ps",n:2,t:"Part 1 · Present simple"},{c:"voc",n:2,t:"Part 2 · Vocabulary"}];
var PLAN=[
["Day 1 · Present simple","Read topic 1.","Do 15 questions."],
["Day 2 · Vocabulary","Learn 10 words.","Do the mock."]
];
</script>
</body>
</html>
`;
