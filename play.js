/** Экран дела: вопрос, таймер, разбор. Вся логика — в core/game.js, здесь только отображение. */
import { CONFIG } from "../config.js";
import { html, mount, $, on, prefersReducedMotion } from "../ui/dom.js";
import { avatar } from "../ui/characters.js";
import { speaker } from "../ui/components.js";
import { storage, KEYS } from "../core/storage.js";
import { session } from "../core/session.js";
import * as game from "../core/game.js";
import { go } from "../router.js";

const LETTERS = ["А", "Б", "В", "Г", "Д", "Е"];
const PRAISE = ["Точно. Так и запишем в заключение.", "Чистая работа, коллега.", "Верно. Видно, что лекции читали.", "Именно так. Следующее дело.", "Без замечаний."];
const SCOLD = ["Не торопитесь с выводами, коллега.", "Такое заключение суд бы не принял.", "Ошибка. Перечитайте это место в лекции.", "Здесь вы спутали понятия. Бывает.", "Не страшно, на ошибках учатся."];
const pick = a => a[Math.floor(Math.random() * a.length)];

export default function play(ctx) {
  let s = session.load();
  if (!s) { go("/", { replace: true }); return; }
  let timer = null;
  const stop = () => { clearInterval(timer); timer = null; };
  const persist = () => session.save(s);
  const score = () => game.totals(s).score;

  function render() {
    if (game.isComplete(s) && s.phase === "question") return finish();
    const item = game.currentItem(s), c = ctx.bank.byId.get(item.id);
    const reviewing = s.phase === "review";
    const res = reviewing ? s.answers[s.answers.length - 1] : null;
    const last = s.index === s.deck.length - 1;
    const left = game.remainingMs(s);
    ctx.tape(`${s.player.name} · ${score()} баллов`);

    mount(ctx.root, html`
      <div class="meta"><span class="me">${avatar(s.player.avatar)}<span>Дело ${s.index + 1} из ${s.deck.length}</span></span>
        <span id="sec">${reviewing ? "" : Math.ceil(left / 1000) + " с"}</span></div>
      <div class="timer"><i id="bar" style="transform:scaleX(${left / (CONFIG.TIME_PER_CASE * 1000)})"></i></div>
      <h2>${c.title}</h2>
      ${speaker(c.who, c.story)}
      <p class="q">${c.question}</p>
      <div class="opts">${item.order.map((k, pos) => {
        const cls = !reviewing ? "" : k === 0 ? "right" : k === res.choice ? "wrong" : "dim";
        return html`<button class="opt ${cls}" data-choice="${k}" ${reviewing ? html`disabled` : ""}><b>${LETTERS[pos]}</b><span>${c.options[k]}</span></button>`;
      })}</div>
      ${reviewing ? html`
        <div class="stamp ${res.correct ? "ok" : "bad"}">${res.correct ? "Верно" : res.choice === game.TIMEOUT ? "Время вышло" : "Ошибка"}</div>
        <div class="after">
          <p class="pts">${res.correct ? `+${res.points} баллов` : `Правильный ответ: ${LETTERS[item.order.indexOf(0)]}`}</p>
          ${speaker("mentor", `${res.correct ? pick(PRAISE) : pick(SCOLD)} ${c.explain}`, { mood: res.correct ? "happy" : "sad", quote: false })}
          <button class="btn" id="next">${last ? "Сдать отчёт" : "Следующее дело"}</button>
        </div>` : ""}`);

    if (reviewing) {
      const nb = $("#next");
      nb.onclick = () => { if (last) return finish(); s = game.next(s); persist(); render(); };
      nb.focus({ preventScroll: true });
      nb.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "nearest" });
    } else {
      window.scrollTo(0, 0);
      startTimer();
    }
  }

  function startTimer() {
    stop();
    const bar = $("#bar"), sec = $("#sec"), limit = CONFIG.TIME_PER_CASE * 1000;
    const tick = () => {
      const left = game.remainingMs(s);
      bar.style.transform = `scaleX(${left / limit})`;
      sec.textContent = Math.ceil(left / 1000) + " с";
      if (left <= 0) choose(game.TIMEOUT);
    };
    tick();
    if (s.phase === "question") timer = setInterval(tick, 100);
  }

  function choose(choice) {
    if (s.phase !== "question") return;
    stop();
    ({ session: s } = game.answer(s, choice));
    persist();
    render();
  }

  function finish() {
    stop();
    const t = game.totals(s);
    storage.set(KEYS.LAST_RESULT, {
      attemptId: s.attemptId, player: s.player, local: { ...t, duration: Math.round((Date.now() - s.startedAt) / 1000) },
      answers: game.answersPayload(s), sent: false, server: null,
    });
    session.clear();
    go("/result", { replace: true });
  }

  const offClick = on(ctx.root, "click", "[data-choice]", (_, b) => choose(+b.dataset.choice));
  const onKey = e => {
    if (s.phase !== "question" || e.target.tagName === "INPUT") return;
    const n = parseInt(e.key, 10), btns = ctx.root.querySelectorAll("[data-choice]");
    if (n >= 1 && n <= btns.length) choose(+btns[n - 1].dataset.choice);
  };
  document.addEventListener("keydown", onKey);

  render();
  return () => { stop(); offClick(); document.removeEventListener("keydown", onKey); };
}
