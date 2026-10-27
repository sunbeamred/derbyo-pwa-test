// Test data for the prototype: one board, 41 players (port of GameData.swift). The real app gets all of
// this from the server.

export const ARGS = new URLSearchParams(location.search);
/** Demo switches, as the iOS launch arguments: `?demoBoard&demoHuman`. */
export const has = (flag) => ARGS.has(flag);

const photos = new Set([
  "rakitic", "modric", "kovacic", "suker", "mandzukic", "perisic", "ronaldinho", "neymar", "rivaldo", "alves",
  "ronaldo9", "marcelo", "vinicius", "casemiro", "rcarlos", "sandro", "kaka", "griezmann", "henry", "dembele",
  "zidane", "benzema", "varane", "pogba", "trezeguet", "platini", "mbappe", "messi", "cr7", "iniesta", "ramos",
  "casillas", "pirlo", "buffon", "lewandowski", "bale", "pedri", "xhaka",
]);

function p(id, name, ru, born, position, nation, ...clubs) {
  const parts = name.split(" ");
  const initials = (parts.length > 1 ? parts.map((w) => w[0]).join("") : name.slice(0, 2)).slice(0, 2).toUpperCase();
  return { id, name, ru, born, position, nation, clubs: new Set(clubs), photo: photos.has(id) ? `img/p_${id}.jpg` : null, initials };
}

export const players = [
  p("rakitic", "Ivan Rakitić", "Ракитич", 1988, "ПЗ", "HR", "barca"),
  p("modric", "Luka Modrić", "Модрич", 1985, "ПЗ", "HR", "real"),
  p("kovacic", "Mateo Kovačić", "Ковачич", 1994, "ПЗ", "HR", "real"),
  p("suker", "Davor Šuker", "Шукер", 1968, "НП", "HR", "real"),
  p("mandzukic", "Mario Mandžukić", "Манджукич", 1986, "НП", "HR", "juve"),
  p("perisic", "Ivan Perišić", "Перишич", 1989, "ПЗ", "HR"),
  p("ronaldinho", "Ronaldinho", "Роналдиньо", 1980, "ПЗ", "BR", "barca"),
  p("neymar", "Neymar", "Неймар", 1992, "НП", "BR", "barca"),
  p("rivaldo", "Rivaldo", "Ривалдо", 1972, "ПЗ", "BR", "barca"),
  p("alves", "Dani Alves", "Алвес", 1983, "ЗЩ", "BR", "barca", "juve"),
  p("ronaldo9", "Ronaldo", "Роналдо", 1976, "НП", "BR", "barca", "real"),
  p("marcelo", "Marcelo", "Марсело", 1988, "ЗЩ", "BR", "real"),
  p("vinicius", "Vinícius Júnior", "Винисиус", 2000, "НП", "BR", "real"),
  p("casemiro", "Casemiro", "Каземиро", 1992, "ПЗ", "BR", "real"),
  p("rcarlos", "Roberto Carlos", "Роберто Карлос", 1973, "ЗЩ", "BR", "real"),
  p("sandro", "Alex Sandro", "Алекс Сандро", 1991, "ЗЩ", "BR", "juve"),
  p("danilo", "Danilo", "Данилу", 1991, "ЗЩ", "BR", "real", "juve"),
  p("kaka", "Kaká", "Кака", 1982, "ПЗ", "BR", "real"),
  p("griezmann", "Antoine Griezmann", "Гризманн", 1991, "НП", "FR", "barca"),
  p("henry", "Thierry Henry", "Анри", 1977, "НП", "FR", "barca", "juve"),
  p("dembele", "Ousmane Dembélé", "Дембеле", 1997, "НП", "FR", "barca"),
  p("zidane", "Zinedine Zidane", "Зидан", 1972, "ПЗ", "FR", "real", "juve"),
  p("benzema", "Karim Benzema", "Бензема", 1987, "НП", "FR", "real"),
  p("varane", "Raphaël Varane", "Варан", 1993, "ЗЩ", "FR", "real"),
  p("pogba", "Paul Pogba", "Погба", 1993, "ПЗ", "FR", "juve"),
  p("trezeguet", "David Trezeguet", "Трезеге", 1977, "НП", "FR", "juve"),
  p("platini", "Michel Platini", "Платини", 1955, "ПЗ", "FR", "juve"),
  p("mbappe", "Kylian Mbappé", "Мбаппе", 1998, "НП", "FR", "real"),
  p("messi", "Lionel Messi", "Месси", 1987, "НП", "AR", "barca"),
  p("cr7", "Cristiano Ronaldo", "Роналду", 1985, "НП", "PT", "real", "juve"),
  p("iniesta", "Andrés Iniesta", "Иньеста", 1984, "ПЗ", "ES", "barca"),
  p("xavi", "Xavi", "Хави", 1980, "ПЗ", "ES", "barca"),
  p("ramos", "Sergio Ramos", "Рамос", 1986, "ЗЩ", "ES", "real"),
  p("casillas", "Iker Casillas", "Касильяс", 1981, "ВР", "ES", "real"),
  p("pirlo", "Andrea Pirlo", "Пирло", 1979, "ПЗ", "IT", "juve"),
  p("buffon", "Gianluigi Buffon", "Буффон", 1978, "ВР", "IT", "juve"),
  p("lewandowski", "Robert Lewandowski", "Левандовский", 1988, "НП", "PL", "barca"),
  p("suarez", "Luis Suárez", "Суарес", 1987, "НП", "UY", "barca"),
  p("bale", "Gareth Bale", "Бейл", 1989, "НП", "WA", "real"),
  p("pedri", "Pedri", "Педри", 2002, "ПЗ", "ES", "barca"),
  p("xhaka", "Granit Xhaka", "Джака", 1992, "ПЗ", "CH"),
];
export const byId = Object.fromEntries(players.map((x) => [x.id, x]));

/** A condition: icon kinds crest | flag | image | person | league, as in the app. */
function cond(key, title, icon, extra = {}) {
  return { key, title, icon, label: null, note: null, holders: null, ...extra };
}
const crest = (n) => ({ kind: "crest", src: `img/${n}.png` });
const flag = (e) => ({ kind: "flag", emoji: e });
const image = (n) => ({ kind: "image", src: `img/${n}.png` });
const person = (photo, frame) => ({ kind: "person", photo: `img/${photo}.jpg`, frame: `img/${frame}.png` });
const league = (e) => ({ kind: "league", emoji: e });

/** A wrong answer's reason, in the site's wording. */
export function miss(c, name) {
  if (c.icon.kind === "flag") return `${name} не подходит: нужна сборная «${c.title}»`;
  if (c.icon.kind === "crest") return `${name} не играл за ${c.title}`;
  const l = c.label ?? c.title;
  // Only the first letter is lowered: «одноклубник: Lionel Messi», not «lionel messi».
  return `${name} не подходит: ${l[0].toLowerCase() + l.slice(1)}`;
}

/** `?demoMix`: six different kinds of condition on one board, as the site deals them. */
export const mixed = has("demoMix");
const notes = has("demoNotes") || has("demoNotes4");

const messiMates = ["rakitic", "ronaldinho", "neymar", "alves", "griezmann", "henry", "dembele", "iniesta", "xavi", "suarez", "pedri", "mbappe"];

export const columns = mixed ? [
  cond("real", "Real Madrid", crest("crest_real")),
  cond("WC", "Чемпион мира", image("trophy-wc"), { label: "Чемпион мира", note: "Был в заявке сборной-победителя чемпионата мира",
    holders: new Set(["zidane", "henry", "trezeguet", "griezmann", "pogba", "varane", "mbappe", "dembele", "ronaldinho", "rivaldo",
      "ronaldo9", "rcarlos", "kaka", "iniesta", "xavi", "ramos", "casillas", "pirlo", "buffon", "messi"]) }),
  cond("messi", "Одноклубник: Messi", person("p_messi", "frame-teammate"), { label: "Одноклубник: Lionel Messi",
    note: "Играл в одном клубе в одни годы — Lionel Messi", holders: new Set([...messiMates, "ramos"]) }),
] : notes ? [
  has("demoNotes4")
    ? cond("messi", "Одноклубник: Messi", person("p_messi", "frame-teammate"), { label: "Одноклубник: Lionel Messi",
      note: "Играл в одном клубе в одни годы — Lionel Messi", holders: new Set(messiMates) })
    : cond("barca", "Barcelona", crest("crest_barca")),
  cond("ucl", "Победитель ЛЧ", image("trophy-ucl"), { label: "Выиграл Лигу чемпионов", note: "Был в составе клуба — победителя Кубка или Лиги чемпионов",
    holders: new Set(["rakitic", "modric", "kovacic", "mandzukic", "perisic", "ronaldinho", "neymar", "rivaldo", "alves", "marcelo",
      "vinicius", "casemiro", "rcarlos", "danilo", "kaka", "henry", "zidane", "benzema", "varane", "dembele", "platini"]) }),
  cond("zidane", "Тренер: Zidane", person("p_zidane", "frame-coach"), { label: "Тренер: Zinedine Zidane", note: "Играл в клубе, когда там работал Zinedine Zidane",
    holders: new Set(["modric", "kovacic", "marcelo", "casemiro", "vinicius", "danilo", "benzema", "varane"]) }),
] : [
  cond("barca", "Barcelona", crest("crest_barca")),
  cond("real", "Real Madrid", crest("crest_real")),
  cond("juve", "Juventus", crest("crest_juve")),
];

export const rows = mixed ? [
  cond("FR", "Франция", flag("🇫🇷")),
  cond("lES", "Чемпионат Испании", league("🇪🇸"), { label: "Чемпионат Испании", note: "Играл за клуб из чемпионата Испании (любой дивизион)",
    holders: new Set(players.filter((x) => x.clubs.has("barca") || x.clubs.has("real")).map((x) => x.id)) }),
  cond("pM", "Полузащитник", image("position-M"), { label: "Полузащитник", holders: new Set(players.filter((x) => x.position === "ПЗ").map((x) => x.id)) }),
] : has("demoNotes4") ? [
  cond("HR", "Хорватия", flag("🇭🇷")),
  cond("BR", "Бразилия", flag("🇧🇷")),
  cond("BDOR", "Золотой мяч", image("golden-ball"), { label: "Золотой мяч", note: "Обладатель «Золотого мяча»",
    holders: new Set(["ronaldinho", "kaka", "rivaldo", "ronaldo9", "zidane", "modric", "messi", "cr7", "benzema", "platini"]) }),
] : [
  cond("HR", "Хорватия", flag("🇭🇷")),
  cond("BR", "Бразилия", flag("🇧🇷")),
  cond("FR", "Франция", flag("🇫🇷")),
];

export const nations = {
  HR: ["Хорватия", "🇭🇷"], BR: ["Бразилия", "🇧🇷"], FR: ["Франция", "🇫🇷"], AR: ["Аргентина", "🇦🇷"],
  PT: ["Португалия", "🇵🇹"], ES: ["Испания", "🇪🇸"], IT: ["Италия", "🇮🇹"], PL: ["Польша", "🇵🇱"],
  UY: ["Уругвай", "🇺🇾"], WA: ["Уэльс", "🏴󠁧󠁢󠁷󠁬󠁳󠁿"], CH: ["Швейцария", "🇨🇭"],
};
export const clubNames = { barca: "Barcelona", real: "Real Madrid", juve: "Juventus" };
export const positions = { "НП": "нападающий", "ПЗ": "полузащитник", "ЗЩ": "защитник", "ВР": "вратарь" };

const holds = (c, pl, own) => (c.holders ? c.holders.has(pl.id) : own);

export function fits(pl, i) {
  const col = columns[i % 3], row = rows[Math.floor(i / 3)];
  return holds(row, pl, pl.nation === row.key) && holds(col, pl, pl.clubs.has(col.key));
}
export const rowFits = (pl, i) => { const row = rows[Math.floor(i / 3)]; return holds(row, pl, pl.nation === row.key); };

export function fold(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replaceAll("ё", "е");
}

/** Suggestions search the whole catalogue, never only the right answers (a site invariant). */
export function search(query) {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  return players.filter((x) => [...fold(x.name).split(" "), ...fold(x.ru).split(" ")].some((w) => w.startsWith(q)) || fold(x.name).startsWith(q)).slice(0, 8);
}

export const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
