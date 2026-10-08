/** Подведение итогов для проектора: пьедестал открывается по одному месту. */
import { html, mount, $ } from "../../ui/dom.js";
import { avatar } from "../../ui/characters.js";
import { playerCell } from "../../ui/components.js";
import { auth, cache, view } from "./state.js";
import { buildDashboard } from "./stats.js";
import { go } from "../../router.js";

const COLUMNS = [1, 0, 2];                 // слева 2-е место, в центре 1-е, справа 3-е
const HEIGHTS = { 0: 190, 1: 140, 2: 105 };

export default function ceremony(ctx) {
  ctx.tape("Подведение итогов");
  const data = cache.get();
  if (!auth.token() || !data) { go("/admin", { replace: true }); return; }
  const top = buildDashboard(data, view, ctx.bank).leaders.slice(0, 10);
  const label = view.group ? `Группа ${view.group}` : "Все группы";
  let revealed = Math.max(0, 3 - top.length); // если игроков меньше трёх, пустые места не объявляем

  function draw() {
    const open = i => i >= 3 - revealed;
    mount(ctx.root, html`
      <p class="small">${label}</p>
      <h1>Итоги</h1>
      ${top.length ? html`<div class="podium">${COLUMNS.map(i => {
        const r = top[i];
        if (!r) return html`<div class="pcol"></div>`;
        return html`<div class="pcol">${open(i)
          ? html`<div class="pav">${avatar(r.avatar, "happy")}</div><p class="pname">${r.name}</p><p class="small">${r.group} · ${r.score} баллов</p>`
          : html`<div class="pav ghosted">?</div>`}
          <div class="pstep" style="height:${HEIGHTS[i]}px">${i + 1}</div></div>`;
      })}</div>` : html`<p class="muted">Пока никто не завершил проверку.</p>`}
      ${revealed >= 3 && top.length > 3 ? html`<div class="tablebox"><table class="narrow-table"><tbody>${top.slice(3).map((r, j) =>
        html`<tr><td class="num">${j + 4}</td><td>${playerCell(r)}</td><td>${r.group}</td><td class="num"><b>${r.score}</b></td></tr>`)}</tbody></table></div>` : ""}
      <div class="row toolbar">
        ${top.length && revealed < 3 ? html`<button class="btn" id="nx">Объявить ${3 - revealed} место</button>` : ""}
        <a class="btn ghost" href="#/admin">Вернуться в кабинет</a></div>`);
    const nx = $("#nx");
    if (nx) { nx.onclick = () => { revealed++; draw(); }; nx.focus(); }
  }
  draw();
}
