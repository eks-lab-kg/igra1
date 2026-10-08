/** Главная: представиться и начать проверку, либо продолжить незаконченную. */
import { CONFIG } from "../config.js";
import { html, mount, $, on } from "../ui/dom.js";
import { AVATARS, avatar } from "../ui/characters.js";
import { speaker, errorBox } from "../ui/components.js";
import { storage, KEYS } from "../core/storage.js";
import { cleanPlayer, validatePlayer } from "../core/identity.js";
import { call, lab } from "../core/api.js";
import { session } from "../core/session.js";
import { createSession } from "../core/game.js";
import { go } from "../router.js";

export default function home(ctx) {
  const s = session.load();
  return s ? resumeView(ctx, s) : formView(ctx);
}

function formView(ctx, { message = "" } = {}) {
  const p = storage.get(KEYS.PLAYER, { name: "", group: "", avatar: 0 });
  mount(ctx.root, html`
    <h1>Экспертная лаборатория</h1>
    ${speaker("mentor", `Добро пожаловать в лабораторию. В архиве ${ctx.bank.cases.length} дел, вам достанутся ${CONFIG.CASES_PER_GAME} случайных — у каждого свой набор. На каждое дело ${CONFIG.TIME_PER_CASE} секунд. За верное решение — ${CONFIG.BASE_POINTS} баллов и до ${CONFIG.SPEED_BONUS} бонусных за скорость. Проверка проходится один раз. Представьтесь, пожалуйста.`)}
    ${lab.isDemo() ? html`<div class="demo">Демо-режим: результаты сохраняются только в этом браузере. Для игры группой откройте ссылку, которую дал руководитель.</div>` : ""}
    <form id="f" novalidate>
      <div class="field"><label for="nm">Фамилия и имя</label><input id="nm" autocomplete="name" maxlength="60" value="${p.name}"></div>
      <div class="field"><label for="gr">Группа</label><input id="gr" maxlength="30" value="${p.group}"></div>
      <p class="small" id="avl">Выберите свой аватар</p>
      <div class="avatars" role="radiogroup" aria-labelledby="avl">
        ${AVATARS.map((_, i) => html`<button type="button" class="av" data-av="${i}" role="radio" aria-checked="${i === p.avatar}" aria-label="Аватар ${i + 1}">${avatar(i, "happy")}</button>`)}
      </div>
      ${errorBox(message)}
      <div class="row"><button class="btn" type="submit" id="go">Приступить к работе</button><a class="btn ghost" href="#/rating">Рейтинг игроков</a></div>
    </form>`);

  let chosen = p.avatar;
  const off = on(ctx.root, "click", "[data-av]", (_, b) => {
    chosen = +b.dataset.av;
    ctx.root.querySelectorAll("[data-av]").forEach(x => x.setAttribute("aria-checked", x === b));
  });
  $("#f").addEventListener("submit", e => {
    e.preventDefault();
    const player = cleanPlayer({ name: $("#nm").value, group: $("#gr").value, avatar: chosen });
    const err = validatePlayer(player);
    if (err) { $(".err").textContent = err; (player.group ? $("#nm") : $("#gr")).focus(); return; }
    storage.set(KEYS.PLAYER, player);
    beginAttempt(ctx, player, $("#go"), $(".err"));
  });
  return off;
}

async function beginAttempt(ctx, player, button, errEl) {
  button.disabled = true;
  errEl.classList.add("pending"); errEl.textContent = "Проверяю, можно ли начать…";
  try {
    const { attemptId, deck } = await call("start", player);
    if (!ctx.isCurrent()) return;
    session.save(createSession({ lab: lab.id(), attemptId, player, deckIds: deck, bank: ctx.bank }));
    go("/play");
  } catch (e) {
    if (!ctx.isCurrent()) return;
    if (e.code === "BLOCKED") return blockedView(ctx, player);
    button.disabled = false; errEl.classList.remove("pending"); errEl.textContent = e.message;
  }
}

function blockedView(ctx, player) {
  ctx.tape(player.name);
  mount(ctx.root, html`
    <h1>Проверка уже пройдена</h1>
    ${speaker("mentor", `${player.name}, вы уже проходили проверку. Ещё одну попытку может разрешить руководитель лаборатории. Попросите его, а потом нажмите «Проверить снова».`, { mood: "sad", quote: false })}
    ${errorBox()}
    <div class="row"><button class="btn" id="again">Проверить снова</button><a class="btn ghost" href="#/rating">Рейтинг игроков</a><button class="btn ghost" id="change">Сменить игрока</button></div>`);
  $("#again").onclick = () => beginAttempt(ctx, player, $("#again"), $(".err"));
  $("#change").onclick = () => formView(ctx);
}

function resumeView(ctx, s) {
  const done = s.answers.length, score = s.answers.reduce((a, x) => a + x.points, 0);
  mount(ctx.root, html`
    <h1>Экспертная лаборатория</h1>
    ${speaker("mentor", `${s.player.name}, у вас незаконченная проверка: решено ${done} из ${s.deck.length} дел, набрано ${score} баллов. Продолжим с того же места.`, { quote: false })}
    <div class="row"><button class="btn" id="cont">Продолжить</button><button class="btn ghost" id="notme">Это не я</button></div>`);
  $("#cont").onclick = () => go("/play");
  $("#notme").onclick = () => formView(ctx);
  $("#cont").focus();
}
