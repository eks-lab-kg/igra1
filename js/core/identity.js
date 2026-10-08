/** Кто играет. Один и тот же человек = одинаковые фамилия+имя+группа после нормализации.
 *  Та же функция есть на сервере (key_), они должны совпадать. */
export const normalize = s => String(s ?? "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
export const playerKey = ({ name, group }) => normalize(name) + "|" + normalize(group);

export function cleanPlayer({ name, group, avatar }) {
  return {
    name: String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 60),
    group: String(group ?? "").trim().replace(/\s+/g, " ").toUpperCase().slice(0, 30),
    avatar: Number.isInteger(+avatar) ? +avatar : 0,
  };
}

/** Возвращает текст ошибки или null. */
export function validatePlayer(p) {
  if (p.name.length < 3) return "Введите фамилию и имя — по ним вас найдут в результатах.";
  if (!/\s/.test(p.name)) return "Нужны и фамилия, и имя — через пробел.";
  if (!p.group) return "Укажите группу.";
  return null;
}
