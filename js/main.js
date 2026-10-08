/** Точка входа: подготовка данных и запуск маршрутизатора. */
import { $, html, mount } from "./ui/dom.js";
import { migrateLegacy } from "./core/storage.js";
import { lab, outbox } from "./core/api.js";
import { loadBank } from "./core/bank.js";
import { define, startRouter } from "./router.js";
import home from "./views/home.js";
import play from "./views/play.js";
import result from "./views/result.js";
import rating from "./views/rating.js";
import admin from "./views/admin/index.js";
import ceremony from "./views/admin/ceremony.js";

async function boot() {
  migrateLegacy();
  lab.captureFromLocation();

  const root = $("#app"), tapeEl = $("#tape-right");
  const ctx = { root, tape: t => { tapeEl.textContent = t || ""; }, bank: null, isCurrent: () => true };

  try {
    ctx.bank = await loadBank();
  } catch (e) {
    const local = location.protocol === "file:";
    mount(root, html`<h1>Не удалось открыть игру</h1>
      <p class="err">${local ? "Игра не работает, если открыть index.html двойным щелчком." : e.message}</p>
      <p class="muted">${local ? "Откройте её по ссылке на сайт (GitHub Pages)." : "Обновите страницу через минуту. Если не помогает — сообщите руководителю."}</p>`);
    return;
  }

  define("/", home);
  define("/play", play);
  define("/result", result);
  define("/rating", rating);
  define("/admin", admin);
  define("/admin/results", ceremony);

  startRouter(ctx);
  outbox.flush(); // досылаем результаты, которые не ушли без интернета
  addEventListener("online", () => outbox.flush());
}

boot();
