/**
 * Маршрутизатор на hash: #/ , #/play , #/result , #/rating , #/admin , #/admin/results.
 * Вид (view) — функция (ctx) => cleanup?; cleanup вызывается при уходе со страницы.
 */
const routes = new Map();
let ctx = null, cleanup = null, token = 0;

const ALIASES = { "admin": "/admin" }; // старая ссылка …/#admin продолжает работать

export const define = (path, view) => routes.set(path, view);

export function go(path, { replace = false } = {}) {
  const hash = "#" + path;
  if (location.hash === hash) return render();
  if (replace) { history.replaceState(null, "", hash); render(); }
  else location.hash = hash;
}

function currentPath() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ""));
  return ALIASES[h] || h || "/";
}

async function render() {
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  const my = ++token;
  const view = routes.get(currentPath()) || routes.get("/");
  ctx.tape("");
  ctx.isCurrent = () => my === token;
  window.scrollTo(0, 0);
  try {
    const result = await view(ctx);
    if (typeof result === "function") { if (my === token) cleanup = result; else result(); }
  } catch (e) {
    console.error(e);
    ctx.root.innerHTML = `<h1>Что-то пошло не так</h1><p class="err">Обновите страницу. Если ошибка повторяется, сообщите руководителю.</p>`;
  }
}

export function startRouter(context) {
  ctx = context;
  addEventListener("hashchange", render);
  render();
}
