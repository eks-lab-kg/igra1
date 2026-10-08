/** Панель руководителя: показывает кэш сразу, обновляет данные в фоне. */
import { html, mount, $, on, toast, fmtDate, fmtDuration } from "../../ui/dom.js";
import { playerCell } from "../../ui/components.js";
import { call, lab } from "../../core/api.js";
import { rankFor } from "../../core/scoring.js";
import { auth, cache, view } from "./state.js";
import { buildDashboard, toCsv } from "./stats.js";
import { go } from "../../router.js";
import { loginView } from "./index.js";

export default function dashboard(ctx) {
  let data = cache.get();
  let status = data ? "Обновляю данные…" : "Загружаю данные…";
  let busy = false;

  function render() {
    if (!ctx.isCurrent()) return;
    if (!data) { mount(ctx.root, html`<h1>Кабинет руководителя</h1><p class="muted">${status}</p>`); return; }
    const d = buildDashboard(data, view, ctx.bank);
    const demo = lab.isDemo();
    mount(ctx.root, html`
      <h1>Кабинет руководителя</h1>
      ${demo ? html`<div class="demo">Демо-режим: показаны попытки, сыгранные в этом браузере. Чтобы собирать результаты группы, подключите Google Таблицу по инструкции.</div>` : ""}
      ${view.flash ? html`<div class="demo">${view.flash}</div>` : ""}
      ${demo ? "" : html`
        <h3 class="first">Ссылка для одногруппников</h3>
        <div class="row share"><input id="share" readonly value="${lab.shareLink()}"><button class="btn ghost" data-act="copy">Скопировать</button></div>`}

      <div class="stats"><span><b>${d.players}</b>участников</span><span><b>${d.attempts}</b>попыток</span><span><b>${d.avg}</b>средний балл</span></div>
      <p class="small" aria-live="polite">${status}</p>

      <div class="row toolbar">
        <a class="btn" href="#/admin/results">Подвести итоги</a>
        ${d.groups.length > 1 ? html`<select class="sel" id="grp" aria-label="Группа"><option value="">Все группы</option>${d.groups.map(g => html`<option ${g === view.group ? html`selected` : ""}>${g}</option>`)}</select>` : ""}
        <label class="chk"><input type="checkbox" id="best" ${view.bestOnly ? html`checked` : ""}> Только лучшая попытка каждого</label>
      </div>
      <div class="row toolbar">
        <button class="btn ghost" data-act="refresh" ${busy ? html`disabled` : ""}>Обновить</button>
        <button class="btn ghost" data-act="grant-all">+1 попытка всем</button>
        <button class="btn ghost" data-act="csv">Скачать CSV</button>
      </div>
      ${d.all ? html`<p class="small">Всем добавлено попыток: ${d.all}.</p>` : ""}

      ${d.table.length ? html`<div class="tablebox"><table>
        <thead><tr><th class="num">#</th><th>Игрок</th><th>Группа</th><th class="num">Баллы</th><th class="num">Верно</th><th>Звание</th><th class="num">Время</th><th>Дата</th><th class="num">Попытки</th><th></th></tr></thead>
        <tbody>${d.table.map(r => html`<tr>
          <td class="num">${r.place ?? "—"}</td><td>${playerCell(r)}</td><td>${r.group}</td>
          ${r.status === "started"
            ? html`<td colspan="4" class="muted">не завершена</td>`
            : html`<td class="num"><b>${r.score}</b></td><td class="num">${r.correct}/${r.total}</td><td>${r.title || rankFor(r.correct, r.total).title}</td><td class="num">${fmtDuration(r.duration)}</td>`}
          <td>${fmtDate(r.date)}</td><td class="num">${r.used} из ${r.allowed}</td>
          <td>${r.used >= r.allowed
            ? html`<button class="mini-btn" data-act="grant" data-name="${r.name}" data-group="${r.group}">+1 попытка</button>`
            : html`<span class="small">может играть</span>`}</td></tr>`)}</tbody></table></div>`
        : html`<p class="muted">Пока никто не сыграл. Отправьте одногруппникам ссылку на игру.</p>`}

      ${d.topics.length ? html`<h3>Темы: доля верных ответов</h3>${bars(d.topics)}` : ""}
      ${d.hardest.length ? html`<h3>10 самых трудных дел</h3>${bars(d.hardest)}` : ""}

      ${demo ? "" : html`<div class="row toolbar footer-actions">
        <button class="btn ghost" data-act="logout">Выйти</button>
        <button class="btn ghost" data-act="logout-all">Выйти на всех устройствах</button></div>`}`);

    const grp = $("#grp");
    if (grp) grp.onchange = e => { view.group = e.target.value; render(); };
    $("#best").onchange = e => { view.bestOnly = e.target.checked; render(); };
  }

  const bars = items => html`<div class="tablebox"><table class="narrow-table"><tbody>${items.map(q => html`<tr>
    <td>${q.title}</td><td><span class="barcell"><span class="bar"><i style="width:${q.pct}%"></i></span>${q.pct}%</span></td><td class="num small">${q.n} отв.</td></tr>`)}</tbody></table></div>`;

  async function refresh() {
    busy = true; status = "Обновляю данные…"; render();
    try {
      const res = await call("list", { token: auth.token() });
      data = { rows: res.rows, extra: res.extra, all: res.all };
      cache.save(data);
      status = "Обновлено в " + new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      if (e.code === "AUTH") { auth.clear(); if (ctx.isCurrent()) loginView(ctx, e.message); return; }
      status = data ? `Нет связи — показаны сохранённые данные. ${e.message}` : e.message;
    }
    busy = false; render();
  }

  async function mutate(action, payload, okMessage) {
    try {
      const res = await call(action, { ...payload, token: auth.token() });
      data = { ...data, extra: res.extra, all: res.all };
      cache.save(data); render(); toast(okMessage);
    } catch (e) {
      if (e.code === "AUTH") { auth.clear(); return loginView(ctx, e.message); }
      toast(e.message); render();
    }
  }

  const off = on(ctx.root, "click", "[data-act]", async (_, b) => {
    switch (b.dataset.act) {
      case "refresh": return refresh();
      case "copy": {
        const i = $("#share"); i.select();
        try { await navigator.clipboard.writeText(i.value); } catch { document.execCommand("copy"); }
        b.textContent = "Скопировано"; return;
      }
      case "grant":
        b.disabled = true; b.textContent = "…";
        return mutate("grant", { name: b.dataset.name, group: b.dataset.group }, `${b.dataset.name}: разрешена ещё одна попытка`);
      case "grant-all":
        if (confirm("Разрешить каждому игроку ещё одну попытку?")) return mutate("grantAll", {}, "Всем разрешена ещё одна попытка");
        return;
      case "csv": {
        const d = buildDashboard(data, view, ctx.bank);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([toCsv(d.table)], { type: "text/csv;charset=utf-8" }));
        a.download = "rezultaty-tse.csv"; a.click(); return;
      }
      case "logout": auth.clear(); view.flash = ""; return go("/");
      case "logout-all":
        if (!confirm("Выйти из кабинета на всех устройствах? Пароль понадобится ввести заново.")) return;
        try { await call("logoutAll", { token: auth.token() }); } catch { /* всё равно выходим здесь */ }
        auth.clear(); return go("/");
    }
  });

  render();
  refresh();
  return off;
}
