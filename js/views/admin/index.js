/** Кабинет руководителя: выбирает нужный экран (подключение → вход → панель). */
import { html, mount, $ } from "../../ui/dom.js";
import { speaker, errorBox } from "../../ui/components.js";
import { call, lab } from "../../core/api.js";
import { auth, cache, view } from "./state.js";
import dashboard from "./dashboard.js";

export default function admin(ctx) {
  ctx.tape("Кабинет руководителя");
  if (lab.isDemo() && !view.demoChosen) return connectView(ctx);
  if (lab.isDemo()) { auth.save("demo"); return dashboard(ctx); }
  if (!auth.token()) return loginView(ctx);
  return dashboard(ctx);
}

function connectView(ctx) {
  mount(ctx.root, html`
    <h1>Подключение таблицы</h1>
    ${speaker("mentor", "Это делается один раз. Вставьте ссылку, которую Google показал после нажатия «Начать развертывание». Она начинается с https://script.google.com", { quote: false })}
    <form id="cf" novalidate>
      <div class="field wide"><label for="lk">Ссылка из Google</label><input id="lk" placeholder="https://script.google.com/macros/s/…/exec"></div>
      ${errorBox()}
      <div class="row"><button class="btn" type="submit" id="cbtn">Подключить</button><button class="btn ghost" type="button" id="demo">Сначала посмотреть демо</button></div>
    </form>`);
  $("#lk").focus();
  $("#demo").onclick = () => { view.demoChosen = true; admin(ctx); };
  $("#cf").addEventListener("submit", async e => {
    e.preventDefault();
    const id = lab.parse($("#lk").value.trim()), err = $(".err");
    if (!id) { err.textContent = "Это не та ссылка. Нужна ссылка вида https://script.google.com/macros/s/…/exec"; return; }
    $("#cbtn").disabled = true; err.classList.add("pending"); err.textContent = "Проверяю связь с таблицей…";
    try {
      await call("ping", {}, { labId: id });
      lab.set(id);
      admin(ctx);
    } catch (ex) {
      $("#cbtn").disabled = false; err.classList.remove("pending");
      err.textContent = ex.code === "OUTDATED" ? ex.message : "Google не отвечает. Проверьте, что при развертывании выбрали «У кого есть доступ: Все».";
    }
  });
}

export function loginView(ctx, message = "") {
  mount(ctx.root, html`
    <h1>Кабинет руководителя</h1>
    <form id="lf" novalidate>
      <div class="field"><label for="pw">Пароль</label><input id="pw" type="password" autocomplete="current-password"></div>
      <p class="small">Если входите впервые — придумайте пароль, он запомнится. На этом устройстве вводить его больше не придётся.</p>
      ${errorBox(message)}
      <div class="row"><button class="btn" type="submit" id="in">Войти</button><button class="btn ghost" type="button" id="re">Подключить другую таблицу</button></div>
    </form>`);
  $("#pw").focus();
  $("#re").onclick = () => connectView(ctx);
  $("#lf").addEventListener("submit", async e => {
    e.preventDefault();
    const password = $("#pw").value, err = $(".err");
    if (!password) return;
    $("#in").disabled = true; err.classList.add("pending"); err.textContent = "Проверяю пароль…";
    try {
      const res = await call("login", { password, siteUrl: lab.siteUrl() });
      auth.save(res.token);
      cache.save({ rows: res.rows || [], extra: res.extra || {}, all: res.all || 0 });
      view.flash = res.first ? "Пароль сохранён. На этом устройстве вводить его больше не нужно." : "";
      if (ctx.isCurrent()) dashboard(ctx, { fresh: true }); // данные уже пришли вместе со входом
    } catch (ex) {
      $("#in").disabled = false; err.classList.remove("pending"); err.textContent = ex.message;
    }
  });
}
