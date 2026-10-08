/** Публичный рейтинг игроков. */
import { html, mount, $ } from "../ui/dom.js";
import { ratingTable } from "../ui/components.js";
import { storage, KEYS } from "../core/storage.js";
import { call } from "../core/api.js";
import { bestPerPlayer } from "../core/ranking.js";

export default async function rating(ctx) {
  ctx.tape("Рейтинг");
  mount(ctx.root, html`<h1>Рейтинг игроков</h1><div id="lb"><p class="muted">Загружаю…</p></div><a class="btn ghost" href="#/">Назад</a>`);
  const me = storage.get(KEYS.PLAYER);
  try {
    const { rows } = await call("top");
    if (ctx.isCurrent()) mount($("#lb"), ratingTable(bestPerPlayer(rows), me?.name ? me : null, 100));
  } catch (e) {
    if (ctx.isCurrent()) mount($("#lb"), html`<p class="err">Не удалось загрузить рейтинг. ${e.message}</p>`);
  }
}
