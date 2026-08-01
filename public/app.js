(() => {
  "use strict";

  const sessionKey = "seibun-narabe-session-v1";
  const seenKey = "seibun-narabe-seen-v1";
  const comparisonKey = "seibun-narabe-comparison-v1";
  const savedOnceKey = "seibun-narabe-saved-v1";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
  const isQa =
    new URLSearchParams(location.search).get("qa") === "1" ||
    location.hostname === "localhost" ||
    navigator.webdriver === true;

  const readLocal = (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const writeLocal = (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  };
  const readJson = (key, fallback) => {
    try {
      return JSON.parse(readLocal(key) ?? "null") ?? fallback;
    } catch {
      return fallback;
    }
  };

  const oldSession = readLocal(sessionKey) ?? "";
  const session = uuidPattern.test(oldSession) ? oldSession : crypto.randomUUID();
  writeLocal(sessionKey, session);
  const headers = () => ({
    "Content-Type": "application/json",
    "X-Seibun-QA": isQa ? "1" : "0",
    "X-Seibun-Session": session,
  });
  const emit = (name) => {
    fetch("/api/telemetry", {
      body: JSON.stringify({ name }),
      headers: headers(),
      keepalive: true,
      method: "POST",
    }).catch(() => undefined);
  };

  const previousVisit = Number(readLocal(seenKey) ?? 0);
  emit("visited");
  if (previousVisit && Date.now() - previousVisit > 8 * 60 * 60 * 1000) emit("returned");
  writeLocal(seenKey, String(Date.now()));

  const searchInput = document.querySelector("#food-search");
  if (!(searchInput instanceof HTMLInputElement)) return;

  const groupFilter = document.querySelector("#group-filter");
  const searchStatus = document.querySelector("#search-status");
  const results = document.querySelector("#food-results");
  const resultCount = document.querySelector("#result-count");
  const comparisonCards = document.querySelector("#comparison-cards");
  const comparisonCount = document.querySelector("#comparison-count");
  const nutrientTabs = document.querySelector("#nutrient-tabs");
  const barComparison = document.querySelector("#bar-comparison");
  const totalNutrients = document.querySelector("#total-nutrients");
  const totalWeight = document.querySelector("#total-weight");
  const copySummary = document.querySelector("#copy-summary");
  const clearComparison = document.querySelector("#clear-comparison");
  const featuredIds = ["01088", "04046", "12004", "13003", "07107", "06263"];
  const groupColors = [
    "#9a6b3f",
    "#9e7852",
    "#c28e37",
    "#8b6f48",
    "#83664a",
    "#477d5e",
    "#b06352",
    "#6c7664",
    "#477a73",
    "#4d7181",
    "#9a5148",
    "#c08f3b",
    "#6a8292",
    "#bf993e",
    "#a86554",
    "#8a674a",
    "#84604e",
    "#657164",
  ];

  let database = null;
  let foodMap = new Map();
  let selected = [];
  let activeNutrient = 1;
  let searchEmitted = false;
  let searchTimer = 0;

  const normalize = (value) =>
    String(value)
      .normalize("NFKC")
      .toLocaleLowerCase("ja-JP")
      .replaceAll(/[ァ-ヶ]/gu, (character) => String.fromCodePoint(character.codePointAt(0) - 0x60))
      .replaceAll(/[\s/・［］＜＞（）()、，,.-]+/gu, " ")
      .trim();
  const amount = (value) => {
    const numeric = Math.round(Number(value));
    return Number.isFinite(numeric) ? Math.min(2000, Math.max(1, numeric)) : 100;
  };
  const parseValue = (value) => {
    if (typeof value === "number" && Number.isFinite(value))
      return { estimated: false, numeric: value, trace: false, unavailable: false };
    if (typeof value !== "string" || !value.trim() || value.trim() === "-")
      return { estimated: false, numeric: null, trace: false, unavailable: true };
    const text = value.trim();
    if (text === "Tr" || text === "(Tr)")
      return { estimated: text.startsWith("("), numeric: null, trace: true, unavailable: false };
    const estimated = text.startsWith("(") && text.endsWith(")");
    const numeric = Number(estimated ? text.slice(1, -1) : text);
    return Number.isFinite(numeric)
      ? { estimated, numeric, trace: false, unavailable: false }
      : { estimated: false, numeric: null, trace: false, unavailable: true };
  };
  const scaled = (raw, grams) => {
    const parsed = parseValue(raw);
    return parsed.numeric === null
      ? parsed
      : { ...parsed, numeric: (parsed.numeric * grams) / 100 };
  };
  const numberText = (numeric, nutrient) => {
    const digits =
      nutrient.unit === "kcal" || Math.abs(numeric) >= 100 ? 0 : Math.abs(numeric) >= 10 ? 1 : 2;
    return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: digits }).format(numeric);
  };
  const valueText = (parsed, nutrient) => {
    if (parsed.unavailable) return "—";
    if (parsed.trace && parsed.numeric === null) return parsed.estimated ? "(Tr)" : "Tr";
    return `${numberText(parsed.numeric, nutrient)}${parsed.estimated ? "※" : ""}`;
  };
  const displayName = (name) => name.replaceAll(/　+/gu, " / ");
  const shortName = (name) => {
    const parts = name.split(/　+/gu).filter(Boolean);
    return parts.at(-1) ?? name;
  };
  const colorFor = (food) => groupColors[Math.max(0, Number(food.g) - 1)] ?? "#31483d";
  const text = (tag, value, className = "") => {
    const element = document.createElement(tag);
    element.textContent = value;
    if (className) element.className = className;
    return element;
  };
  const button = (label, className, action) => {
    const element = text("button", label, className);
    element.type = "button";
    element.addEventListener("click", action);
    return element;
  };
  const announce = (message) => {
    if (searchStatus) searchStatus.textContent = message;
  };

  const selectedEntry = (id) => selected.find((entry) => entry.id === id);
  const persist = () => {
    writeLocal(comparisonKey, JSON.stringify(selected.slice(0, 4)));
    if (selected.length && !readLocal(savedOnceKey)) {
      writeLocal(savedOnceKey, "1");
      emit("saved");
    }
  };

  const nutrientValue = (food, nutrientIndex, grams) => scaled(food.v[nutrientIndex], grams);
  const totalFor = (nutrientIndex) => {
    let numeric = 0;
    let hasNumeric = false;
    let estimated = false;
    let estimatedTrace = false;
    let trace = false;
    selected.forEach((entry) => {
      const food = foodMap.get(entry.id);
      if (!food) return;
      const parsed = nutrientValue(food, nutrientIndex, entry.grams);
      if (parsed.numeric !== null) {
        numeric += parsed.numeric;
        hasNumeric = true;
      }
      estimated ||= parsed.estimated && parsed.numeric !== null;
      estimatedTrace ||= parsed.estimated && parsed.trace;
      trace ||= parsed.trace;
    });
    return {
      estimated,
      estimatedTrace,
      numeric: hasNumeric ? numeric : null,
      trace,
      unavailable: !hasNumeric && !trace,
    };
  };

  const renderTotals = () => {
    if (!database || !totalNutrients || !totalWeight) return;
    totalWeight.textContent = `${selected.reduce((sum, entry) => sum + entry.grams, 0).toLocaleString("ja-JP")} g`;
    totalNutrients.replaceChildren();
    [0, 1, 2, 3, 4, 5].forEach((index) => {
      const nutrient = database.nutrients[index];
      const term = text("dt", nutrient.label);
      const detail = document.createElement("dd");
      const parsed = totalFor(index);
      detail.append(text("strong", valueText(parsed, nutrient)), text("span", nutrient.unit));
      if (parsed.trace && parsed.numeric !== null)
        detail.append(text("small", parsed.estimatedTrace ? "+ (Tr)" : "+ Tr"));
      totalNutrients.append(term, detail);
    });
  };

  const renderBars = () => {
    if (!database || !barComparison) return;
    barComparison.replaceChildren();
    if (!selected.length) {
      barComparison.append(text("p", "食品を置くと棒が伸びます。"));
      return;
    }
    const nutrient = database.nutrients[activeNutrient];
    const items = selected
      .map((entry) => {
        const food = foodMap.get(entry.id);
        return food
          ? { entry, food, value: nutrientValue(food, activeNutrient, entry.grams) }
          : null;
      })
      .filter(Boolean);
    const maximum = Math.max(0, ...items.map((item) => item.value.numeric ?? 0));
    items.forEach(({ entry, food, value }) => {
      const row = document.createElement("article");
      const head = document.createElement("div");
      head.append(
        text("strong", shortName(food.n)),
        text("span", `${valueText(value, nutrient)} ${nutrient.unit}`),
      );
      const track = document.createElement("div");
      track.className = "bar-track";
      const fill = document.createElement("i");
      const percent =
        value.numeric === null
          ? value.trace
            ? 2
            : 0
          : maximum
            ? Math.max(3, (value.numeric / maximum) * 100)
            : 3;
      fill.style.width = `${percent}%`;
      fill.style.backgroundColor = colorFor(food);
      track.append(fill);
      row.append(head, track, text("small", `${entry.grams}g あたり`));
      barComparison.append(row);
    });
  };

  const renderNutrientTabs = () => {
    if (!database || !nutrientTabs) return;
    nutrientTabs.replaceChildren();
    database.nutrients.forEach((nutrient, index) => {
      const tab = button(nutrient.label, "", () => {
        activeNutrient = index;
        renderNutrientTabs();
        renderBars();
      });
      tab.setAttribute("aria-pressed", String(index === activeNutrient));
      nutrientTabs.append(tab);
    });
  };

  const comparisonCard = (entry, position) => {
    const food = foodMap.get(entry.id);
    if (!food) return null;
    const card = document.createElement("article");
    card.className = "comparison-card";
    card.style.setProperty("--food-color", colorFor(food));
    const index = text("span", String(position + 1).padStart(2, "0"), "comparison-index");
    const heading = document.createElement("header");
    const group = text("span", database.groups[food.g]);
    const title = text("h3", displayName(food.n));
    heading.append(group, title);
    const remove = button("外す", "remove-food", () => {
      selected = selected.filter((item) => item.id !== entry.id);
      persist();
      renderAll();
      announce(`${shortName(food.n)}を比較台から外しました`);
    });
    const amountLabel = document.createElement("label");
    amountLabel.className = "amount-control";
    amountLabel.append(text("span", "食べる量"));
    const amountBox = document.createElement("span");
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = "2000";
    input.step = "1";
    input.value = String(entry.grams);
    input.setAttribute("aria-label", `${shortName(food.n)}の量`);
    input.addEventListener("change", () => {
      entry.grams = amount(input.value);
      input.value = String(entry.grams);
      persist();
      renderTotals();
      renderBars();
      renderComparisonValues(card, food, entry.grams);
      emit("amount_changed");
    });
    amountBox.append(input, text("b", "g"));
    amountLabel.append(amountBox);
    const values = document.createElement("dl");
    values.className = "comparison-values";
    values.dataset.values = "";
    const note = food.note && !/^\d+$/u.test(food.note) ? text("p", food.note, "food-note") : null;
    card.append(index, heading, remove, amountLabel, values);
    if (note) card.append(note);
    renderComparisonValues(card, food, entry.grams);
    return card;
  };

  const renderComparisonValues = (card, food, grams) => {
    const list = card.querySelector("[data-values]");
    if (!list || !database) return;
    list.replaceChildren();
    [0, 1, 2, 4, 5].forEach((nutrientIndex) => {
      const nutrient = database.nutrients[nutrientIndex];
      list.append(
        text("dt", nutrient.label),
        text(
          "dd",
          `${valueText(nutrientValue(food, nutrientIndex, grams), nutrient)} ${nutrient.unit}`,
        ),
      );
    });
  };

  const renderComparison = () => {
    if (!comparisonCards || !comparisonCount) return;
    comparisonCards.replaceChildren();
    comparisonCount.textContent = `${selected.length} / 4`;
    if (!selected.length) {
      comparisonCards.append(
        text("p", "食品棚から「比べる」を押すと、ここに食品トレイが並びます。", "empty-comparison"),
      );
    } else {
      selected.forEach((entry, index) => {
        const card = comparisonCard(entry, index);
        if (card) comparisonCards.append(card);
      });
    }
    [copySummary, clearComparison].forEach((control) => {
      if (control) control.disabled = selected.length === 0;
    });
  };

  const updateResultButtons = () => {
    document.querySelectorAll("[data-add-food]").forEach((control) => {
      if (!(control instanceof HTMLButtonElement)) return;
      const active = Boolean(selectedEntry(control.dataset.addFood));
      control.textContent = active ? "比較台にあります" : "比べる";
      control.disabled = active;
    });
  };

  const renderAll = () => {
    renderComparison();
    renderNutrientTabs();
    renderBars();
    renderTotals();
    updateResultButtons();
  };

  const addFood = (id) => {
    const food = foodMap.get(id);
    if (!food || selectedEntry(id)) return;
    if (selected.length >= 4) {
      announce("比較台は4食品までです。どれかを外してから追加してください");
      document
        .querySelector("#comparison-heading")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    selected.push({ grams: 100, id });
    persist();
    renderAll();
    announce(`${shortName(food.n)}を比較台へ置きました`);
    emit("compared");
  };

  const foodCard = (food) => {
    const card = document.createElement("article");
    card.className = "food-card";
    card.style.setProperty("--food-color", colorFor(food));
    const top = document.createElement("header");
    top.append(text("span", database.groups[food.g]), text("small", `No. ${food.id}`));
    const title = text("h3", displayName(food.n));
    const facts = document.createElement("dl");
    [0, 1, 4, 5].forEach((index) => {
      const nutrient = database.nutrients[index];
      facts.append(
        text("dt", nutrient.label),
        text("dd", `${valueText(parseValue(food.v[index]), nutrient)} ${nutrient.unit}`),
      );
    });
    const add = button("比べる", "add-food", () => addFood(food.id));
    add.dataset.addFood = food.id;
    card.append(top, title, facts, add);
    return card;
  };

  const matches = () => {
    if (!database) return [];
    const query = normalize(searchInput.value);
    const selectedGroup = groupFilter instanceof HTMLSelectElement ? groupFilter.value : "";
    if (!query && !selectedGroup) return featuredIds.map((id) => foodMap.get(id)).filter(Boolean);
    const terms = query.split(" ").filter(Boolean);
    return database.foods
      .filter((food) => !selectedGroup || food.g === selectedGroup)
      .filter((food) => terms.every((term) => food.search.includes(term)))
      .slice(0, 60);
  };

  const renderResults = () => {
    if (!results || !resultCount || !database) return;
    const foods = matches();
    results.replaceChildren();
    resultCount.textContent = `${foods.length}件`;
    if (!foods.length) {
      const empty = document.createElement("div");
      empty.className = "empty-results";
      empty.append(
        text("span", "食"),
        text("h3", "一致する食品がありません"),
        text("p", "短い食品名にするか、食品群を「すべて」に戻してお試しください。"),
      );
      results.append(empty);
    } else {
      foods.forEach((food) => results.append(foodCard(food)));
    }
    updateResultButtons();
    const query = normalize(searchInput.value);
    announce(
      query || (groupFilter instanceof HTMLSelectElement && groupFilter.value)
        ? `${foods.length}食品を表示しました`
        : "よく見る食品を並べました",
    );
  };

  const scheduleSearch = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      renderResults();
      if (!searchEmitted && normalize(searchInput.value).length >= 2) {
        searchEmitted = true;
        emit("searched");
      }
    }, 120);
  };

  const copyText = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
  };

  copySummary?.addEventListener("click", async () => {
    if (!database) return;
    const lines = [
      "食品成分の比較",
      ...selected.map((entry) => {
        const food = foodMap.get(entry.id);
        return food ? `・${displayName(food.n)}：${entry.grams}g` : "";
      }),
      "",
      "トレイ合計",
      ...[0, 1, 2, 3, 4, 5].map((index) => {
        const nutrient = database.nutrients[index];
        const value = totalFor(index);
        const trace =
          value.trace && value.numeric !== null ? (value.estimatedTrace ? " + (Tr)" : " + Tr") : "";
        return `・${nutrient.label}：${valueText(value, nutrient)}${trace} ${nutrient.unit}`;
      }),
      "",
      "出典：文部科学省「日本食品標準成分表（八訂）増補2023年」を加工",
      "https://seibun-narabe.yhay81.com",
    ].filter((line) => line !== "");
    await copyText(lines.join("\n"));
    announce("比較内容をコピーしました");
    emit("summary_copied");
  });

  clearComparison?.addEventListener("click", () => {
    selected = [];
    persist();
    renderAll();
    announce("比較台を空にしました");
  });
  searchInput.addEventListener("input", scheduleSearch);
  groupFilter?.addEventListener("change", () => {
    renderResults();
    if (!searchEmitted && groupFilter instanceof HTMLSelectElement && groupFilter.value) {
      searchEmitted = true;
      emit("searched");
    }
  });
  document.querySelectorAll("[data-food]").forEach((control) =>
    control.addEventListener("click", () => {
      if (control instanceof HTMLButtonElement) addFood(control.dataset.food ?? "");
    }),
  );

  const load = async () => {
    try {
      const response = await fetch("/foods.json", { cache: "force-cache" });
      if (!response.ok) throw new Error("food_data_failed");
      database = await response.json();
      if (!Array.isArray(database.foods) || database.foods.length !== 2538)
        throw new Error("food_data_invalid");
      database.foods.forEach((food) => {
        food.search = normalize(`${food.n} ${food.note} ${database.groups[food.g] ?? ""}`);
      });
      foodMap = new Map(database.foods.map((food) => [food.id, food]));
      const saved = readJson(comparisonKey, []);
      selected = (Array.isArray(saved) ? saved : [])
        .filter((entry) => entry && typeof entry.id === "string" && foodMap.has(entry.id))
        .slice(0, 4)
        .map((entry) => ({ grams: amount(entry.grams), id: entry.id }));
      renderResults();
      renderAll();
    } catch {
      announce("食品成分表を読み込めませんでした。再読み込みしてお試しください");
      if (results)
        results.replaceChildren(text("p", "食品成分表を読み込めませんでした。", "loading-note"));
    }
  };

  void load();
})();
