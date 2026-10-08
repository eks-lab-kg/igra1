/** Итог: отправка результата на сервер (с повтором без сети) и место в рейтинге. */
import { html, mount, $ } from "../ui/dom.js";
import { avatar } from "../ui/characters.js";
import { speaker, ratingTable } from "../ui/components.js";
import { storage, KEYS } from "../core/storage.js";
import { call, outbox, isTransient, pickResult, lab } from "../core/api.js";
import { rankFor } from "../core/scoring.js";
import { bestPerPlayer } from "../core/ranking.js";
import { go } from "../router.js";

export default async function result(ctx) {
  let r = storage.get(KEYS.LAST_RESULT);
  if (!r) { go("/", { replace: true }); return; }

  const draw = (status, statusClass = "") => {
    const t = r.server || r.local;
    const rank = rankFor(t.correct, t.total);
    ctx.tape(`${r.player.name} · ${t.score} баллов`);
    mount(ctx.root, html`
      <p class="small">Итог проверки</p>
      <p class="final-rank">${rank.title}</p>
      <div class="speaker">${avatar(r.player.avatar, rank.mood)}<div class="bubble">
        <p class="who"><b>${r.player.name}</b>, <span class="muted">${r.player.group}</span></p>
        <p>${t.score} баллов. Верных решений: ${t.correct} из ${t.total}. Время: ${Math.floor(t.duration / 60)} мин ${t.duration % 60} с.</p></div></div>
      ${speaker("mentor", rank.note, { mood: rank.mood, quote: false })}
      <p class="status ${statusClass}" id="status">${status}</p>
      <div id="rating"></div>
      <div class="row"><a class="btn ghost" href="#/">На главную</a></div>`);
  };

  if (r.sent) {
    draw(lab.isDemo() ? "Демо-режим: результат сохранён в этом браузере." : "Результат сохранён у руководителя лаборатории.", "ok");
  } else {
    draw("Отправляю результат…");
    try {
      const data = await call("finish", { attemptId: r.attemptId, answers: r.answers });
      r = { ...r, sent: true, server: pickResult(data) };
      storage.set(KEYS.LAST_RESULT, r);
      if (!ctx.isCurrent()) return;
      draw(lab.isDemo() ? "Демо-режим: результат сохранён в этом браузере." : "Результат отправлен руководителю лаборатории.", "ok");
    } catch (e) {
      if (!ctx.isCurrent()) return;
      if (isTransient(e)) {
        outbox.add("finish", { attemptId: r.attemptId, answers: r.answers });
        draw(html`Результат пока не отправлен: ${e.message} Он сохранён и уйдёт сам, как только появится связь. <button class="btn ghost" id="retry">Отправить сейчас</button>`, "bad");
        $("#retry").onclick = async () => { $("#status").textContent = "Отправляю…"; await outbox.flush(); result(ctx); };
      } else {
        draw(`Не удалось сохранить результат: ${e.message}`, "bad");
      }
      return;
    }
  }

  const box = $("#rating");
  try {
    const { rows } = await call("top");
    if (!ctx.isCurrent()) return;
    mount(box, html`<h3>Рейтинг игроков</h3>${ratingTable(bestPerPlayer(rows), r.player, 10)}`);
  } catch {
    if (ctx.isCurrent()) mount(box, html`<p class="small">Рейтинг сейчас недоступен — проверьте интернет.</p>`);
  }
}
