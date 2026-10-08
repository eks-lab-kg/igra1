/** Повторяющиеся куски интерфейса. */
import { html } from "./dom.js";
import { PEOPLE, portrait, avatar } from "./characters.js";
import { playerKey } from "../core/identity.js";

/** Реплика персонажа. who — ключ из PEOPLE или объект персонажа. */
export function speaker(who, text, { mood = "neutral", quote = true } = {}) {
  const p = typeof who === "string" ? PEOPLE[who] : who;
  return html`<div class="speaker">${portrait(p, mood)}<div class="bubble">
    <p class="who"><b>${p.name}</b>, <span class="muted">${p.role}</span></p>
    <p class="${quote ? "said" : ""}">${text}</p></div></div>`;
}

export const playerCell = r => html`<span class="mini">${avatar(r.avatar)}</span>${r.name}`;

/** Таблица рейтинга; me — подсвечиваемый игрок, limit — сколько строк показать сверху. */
export function ratingTable(list, me = null, limit = 10) {
  if (!list.length) return html`<p class="muted">Пока в рейтинге никого нет. Будьте первым!</p>`;
  const myIdx = me ? list.findIndex(r => playerKey(r) === playerKey(me)) : -1;
  const rows = list.slice(0, limit).map((r, i) => ({ r, i }));
  if (myIdx >= limit) rows.push({ gap: true }, { r: list[myIdx], i: myIdx });
  return html`
    ${myIdx >= 0 ? html`<p class="place">Ваше место: <b>${myIdx + 1}</b> из ${list.length}</p>` : ""}
    <div class="tablebox"><table class="narrow-table">
      <thead><tr><th class="num">Место</th><th>Игрок</th><th>Группа</th><th class="num">Баллы</th></tr></thead>
      <tbody>${rows.map(x => x.gap
        ? html`<tr><td colspan="4" class="muted">…</td></tr>`
        : html`<tr class="${x.i === myIdx ? "mine" : ""}"><td class="num">${x.i + 1}</td><td>${playerCell(x.r)}</td><td>${x.r.group}</td><td class="num"><b>${x.r.score}</b></td></tr>`)}
      </tbody></table></div>`;
}

export const errorBox = msg => msg ? html`<p class="err" role="alert">${msg}</p>` : html`<p class="err" aria-live="polite"></p>`;
