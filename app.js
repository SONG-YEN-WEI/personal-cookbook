(() => {
  "use strict";

  const STATUS = {
    planned: "待實證", pending: "第 1 次測試待回報", in_progress: "料理中",
    completed: "已完成", tested: "做過，待整理",
    validated: "已驗證", needs_revision: "待修訂", unreviewed: "待核對"
  };
  const $ = (id) => document.getElementById(id);
  const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const state = {
    items: [], meals: [], histories: [], drafts: [], selected: null, editHistoryId: null,
    activeDate: today(), calendarMonth: today().slice(0, 7), photoUrls: { calendar: [], history: [] }
  };
  let dbPromise;

  function element(tag, className = "", value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }
  function button(label, click, className = "secondary-button") {
    const node = element("button", className, label);
    node.type = "button";
    node.addEventListener("click", click);
    return node;
  }
  function badge(status, label) {
    const node = element("span", "status-badge", label || STATUS[status] || status);
    node.dataset.status = status;
    return node;
  }
  function report(id, message, error = false) {
    const node = $(id);
    node.textContent = message;
    node.classList.toggle("error", error);
  }
  async function fetchJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`${path} 載入失敗（HTTP ${response.status}）`);
    return response.json();
  }
  function validateData(recipes, registry, meals, histories) {
    if (![recipes, registry, meals, histories].every(Array.isArray)) throw new Error("資料檔必須是陣列。");
    const ids = new Set();
    const items = [];
    for (const [kind, source] of [["recipe", recipes], ["candidate", registry]]) {
      for (const entry of source) {
        if (!entry || typeof entry.id !== "string" || !entry.id ||
            typeof entry.title !== "string" || !entry.title ||
            !Object.hasOwn(STATUS, entry.status) ||
            (kind === "recipe" && (typeof entry.version !== "string" ||
              !Array.isArray(entry.ingredients) || !Array.isArray(entry.steps)))) {
          throw new Error(`${kind} 資料格式錯誤。`);
        }
        const key = kind === "recipe" ? `${entry.id}@${entry.version}` : entry.id;
        if (ids.has(key)) throw new Error(`重複的食譜版本：${key}`);
        ids.add(key);
        items.push({ ...entry, kind });
      }
    }
    for (const meal of meals) {
      if (!meal.id || !/^\d{4}-\d{2}-\d{2}$/.test(meal.date) || !Array.isArray(meal.recipeRefs) ||
          meal.recipeRefs.some((ref) => !items.some((item) => item.kind === "recipe" &&
            item.id === ref.recipeId && item.version === ref.version))) {
        throw new Error("餐次參照了不存在的食譜版本。");
      }
    }
    for (const entry of histories) {
      if (!entry.id || !items.some((item) => item.id === entry.recipeId &&
          item.version === entry.recipeVersion) ||
          !meals.some((meal) => meal.id === entry.mealSessionId) ||
          entry.status !== "pending" || entry.testNumber !== 1) {
        throw new Error("初始料理紀錄格式錯誤。");
      }
    }
    return items;
  }
  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) return reject(new Error("此瀏覽器不支援 IndexedDB"));
        const request = indexedDB.open("personal-cookbook", 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("sessions")) {
            const store = db.createObjectStore("sessions", { keyPath: "id" });
            store.createIndex("recipeId", "recipeId");
          }
          if (!db.objectStoreNames.contains("mealSessions")) db.createObjectStore("mealSessions", { keyPath: "id" });
          if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("資料庫開啟失敗"));
      }).catch((error) => { dbPromise = null; throw error; });
    }
    return dbPromise;
  }
  async function transact(names, mode, action) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, mode);
      let result;
      try { result = action(tx); }
      catch (error) { tx.abort(); reject(error); return; }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("資料庫操作失敗"));
      tx.onabort = () => reject(tx.error || new Error("資料庫操作已取消"));
    });
  }
  async function getAll(name) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(name, "readonly").objectStore(name).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("讀取失敗"));
    });
  }
  async function seedInitial(meals, histories) {
    await transact(["mealSessions", "sessions", "meta"], "readwrite", (tx) => {
      const meta = tx.objectStore("meta");
      const request = meta.get("seed-2026-10-06");
      request.onsuccess = () => {
        if (request.result) return;
        meals.forEach((meal) => tx.objectStore("mealSessions").put(meal));
        histories.forEach((entry) => tx.objectStore("sessions").put(entry));
        meta.put({ id: "seed-2026-10-06" });
      };
    });
  }
  async function refresh() {
    const [meals, histories, meta] = await Promise.all([
      getAll("mealSessions"), getAll("sessions"), getAll("meta")
    ]);
    state.meals = meals;
    state.histories = histories;
    state.drafts = meta.filter((entry) => entry.id.startsWith("draft:"));
    renderList();
    renderMeal();
    renderCalendar();
    if (state.selected) {
      $("detail-status").textContent = STATUS[effectiveStatus(state.selected)];
      $("detail-status").dataset.status = effectiveStatus(state.selected);
      renderHistory(state.selected.id);
    }
  }
  function recipe(id, version) {
    const matches = state.items.filter((item) => item.id === id && (version == null || item.version === version));
    return matches.sort((a, b) => (b.version || "").localeCompare(a.version || "", undefined, { numeric: true }))[0];
  }
  function currentItems() {
    return state.items.filter((item) => item.kind === "candidate" || recipe(item.id)?.version === item.version);
  }
  function mealFor(date) {
    return state.meals.filter((meal) => meal.date === date && meal.meal === "dinner")
      .sort((a, b) => a.id.localeCompare(b.id))[0] || null;
  }
  function draftFor(date) {
    return state.drafts.find((entry) => entry.id === `draft:${date}`) || null;
  }
  function historyForMeal(mealId, recipeId) {
    return state.histories.find((entry) => entry.mealSessionId === mealId && entry.recipeId === recipeId);
  }
  function effectiveStatus(item) {
    const latest = state.histories.filter((entry) => entry.recipeId === item.id &&
      entry.recipeVersion === item.version && entry.status !== "pending")
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0];
    return latest?.status || item.status;
  }
  function openRecipe(id, version) {
    window.location.hash = encodeURIComponent(version ? `${id}@${version}` : id);
  }

  function renderList() {
    const query = $("search").value.trim().toLocaleLowerCase("zh-Hant");
    const filter = $("status-filter").value;
    const filtered = currentItems().filter((item) => {
      const haystack = [item.title, item.category, item.method, item.summary].filter(Boolean).join(" ").toLocaleLowerCase("zh-Hant");
      return (filter === "all" || effectiveStatus(item) === filter) && (!query || haystack.includes(query));
    });
    $("recipe-list").replaceChildren();
    $("result-count").textContent = `${filtered.length} 道料理`;
    $("empty-state").hidden = filtered.length > 0;
    for (const item of filtered) {
      const card = element("article", "recipe-card");
      const top = element("div", "card-top");
      top.append(element("span", "eyebrow", item.category || "未分類"), badge(effectiveStatus(item)));
      card.append(top, element("h3", "", item.title));
      card.append(element("p", "", item.summary || "尚無可照做的正式食譜。"));
      const footer = element("div", "card-footer");
      footer.append(element("span", "", `${item.method || "做法待核對"} · ${item.version ? `v${item.version}` : "版本待核對"}`));
      card.append(footer);
      const actions = element("div", "card-actions");
      actions.append(button("查看食譜", () => openRecipe(item.id, item.version), "text-button"));
      const add = button("加入今晚晚餐", () => addRecipe(item));
      add.disabled = item.kind !== "recipe";
      if (add.disabled) add.title = "待核對成獨立食譜後才能加入餐次";
      actions.append(add);
      card.append(actions);
      $("recipe-list").append(card);
    }
  }
  function detailBlock(title, values, ordered = false) {
    const block = element("section", "detail-block");
    block.append(element("h3", "", title));
    const list = element(ordered ? "ol" : "ul");
    values.forEach((value) => list.append(element("li", "", value)));
    block.append(list);
    return block;
  }
  function clearPhotoUrls(scope) {
    state.photoUrls[scope].forEach((url) => URL.revokeObjectURL(url));
    state.photoUrls[scope] = [];
  }
  function photo(blob, alt, scope) {
    const node = element("img");
    const url = URL.createObjectURL(blob);
    state.photoUrls[scope].push(url);
    node.src = url;
    node.alt = alt;
    node.loading = "lazy";
    return node;
  }
  async function showSelected() {
    let id;
    try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { id = ""; }
    const separator = id.lastIndexOf("@");
    const item = separator < 0 ? recipe(id) : recipe(id.slice(0, separator), id.slice(separator + 1));
    state.selected = item || null;
    state.editHistoryId = null;
    $("session-form").reset();
    $("session-submit").textContent = "儲存這道菜的結果";
    $("session-outcome").querySelector('[value="validated"]').disabled = item?.kind !== "recipe";
    $("detail").hidden = !item;
    if (!item) {
      clearPhotoUrls("history");
      return;
    }
    $("detail-kicker").textContent = `${item.category || "未分類"} · ${item.method || "做法待核對"} · ${item.version ? `v${item.version}` : "版本待核對"}`;
    $("detail-title").textContent = item.title;
    $("detail-summary").textContent = item.summary || "";
    $("detail-status").textContent = STATUS[effectiveStatus(item)];
    $("detail-status").dataset.status = effectiveStatus(item);
    const content = $("detail-content");
    content.replaceChildren();
    if (item.kind === "candidate") {
      content.append(element("p", "notice", "這是待核對的料理線索，尚無可照做的正式食譜。"));
      if (item.evidence) {
        const block = element("section", "detail-block");
        block.append(element("h3", "", "來源線索"), element("blockquote", "source-quote", item.evidence));
        content.append(block);
      }
      if (item.reviewNote) content.append(detailBlock("待確認", [item.reviewNote]));
    } else {
      if (effectiveStatus(item) === "planned") content.append(element("p", "notice", "這道菜是第一次測試配方，尚未完成實證。"));
      content.append(detailBlock("食材", item.ingredients.map((entry) => `${entry.name}${entry.amount ? `　${entry.amount}` : ""}`)));
      content.append(detailBlock("料理步驟", item.steps.map((entry) => entry.text), true));
      if (item.sourceNote) content.append(element("p", "detail-summary", item.sourceNote));
      content.append(button("加入今晚晚餐", () => addRecipe(item)));
    }
    report("session-message", "");
    await renderHistory(item.id);
    $("detail").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function persistMeal(meal) {
    await transact("mealSessions", "readwrite", (tx) => tx.objectStore("mealSessions").put(meal));
    await refresh();
  }
  async function persistDraft(draft) {
    await transact("meta", "readwrite", (tx) => {
      if (draft.recipeRefs.length) tx.objectStore("meta").put(draft);
      else tx.objectStore("meta").delete(draft.id);
    });
    await refresh();
  }
  async function addRecipe(item) {
    try {
      let meal = mealFor(state.activeDate);
      let draft = meal ? null : draftFor(state.activeDate);
      const composition = meal || draft || { id: `draft:${state.activeDate}`, recipeRefs: [] };
      if (composition.recipeRefs.some((ref) => ref.recipeId === item.id)) {
        return report("meal-message", "這道菜已在這餐。");
      }
      const recipeRefs = [...composition.recipeRefs, { recipeId: item.id, version: item.version }];
      if (meal) {
        meal = { ...meal, status: meal.status === "completed" ? "in_progress" : meal.status, recipeRefs };
        await persistMeal(meal);
        if (meal.status === "in_progress") await ensurePending(meal);
      } else {
        draft = { ...composition, recipeRefs };
        await persistDraft(draft);
      }
      report("meal-message", `已加入「${item.title}」。`);
    } catch (error) { report("meal-message", `加入失敗：${error.message}`, true); }
  }
  async function removeRecipe(composition, index) {
    const ref = composition.recipeRefs[index];
    const meal = composition.id.startsWith("draft:") ? null : composition;
    const history = meal && historyForMeal(meal.id, ref.recipeId);
    if (history?.status && history.status !== "pending") return report("meal-message", "這道菜已有完成的紀錄，不能從餐次移除。", true);
    try {
      const refs = composition.recipeRefs.filter((_, i) => i !== index);
      if (!meal) {
        await persistDraft({ ...composition, recipeRefs: refs });
        return report("meal-message", "已從這餐的草稿移除。");
      }
      await transact(["mealSessions", "sessions"], "readwrite", (tx) => {
        if (refs.length) tx.objectStore("mealSessions").put({ ...meal, recipeRefs: refs });
        else tx.objectStore("mealSessions").delete(meal.id);
        if (history) tx.objectStore("sessions").delete(history.id);
      });
      await refresh();
      report("meal-message", "已從這餐移除。");
    } catch (error) { report("meal-message", `移除失敗：${error.message}`, true); }
  }
  async function moveRecipe(composition, index, offset) {
    const next = index + offset;
    if (next < 0 || next >= composition.recipeRefs.length) return;
    const refs = [...composition.recipeRefs];
    [refs[index], refs[next]] = [refs[next], refs[index]];
    try {
      const updated = { ...composition, recipeRefs: refs };
      if (composition.id.startsWith("draft:")) await persistDraft(updated);
      else await persistMeal(updated);
    }
    catch (error) { report("meal-message", `排序失敗：${error.message}`, true); }
  }
  function renderMeal() {
    const meal = mealFor(state.activeDate);
    const composition = meal || draftFor(state.activeDate);
    $("meal-title").textContent = state.activeDate === today() ? "今晚晚餐" : `${state.activeDate} 晚餐`;
    $("meal-date-label").textContent = state.activeDate;
    $("meal-list").replaceChildren();
    $("meal-status").replaceChildren();
    $("meal-status").textContent = meal ? STATUS[meal.status] || meal.status : composition ? "待開始" : "尚未組合";
    $("meal-status").dataset.status = meal?.status || "planned";
    $("start-meal").disabled = !composition || (meal && meal.status !== "planned");
    $("start-meal").textContent = meal?.status === "in_progress" ? "料理中" : meal?.status === "completed" ? "已完成" : "開始料理";
    if (!composition) {
      $("meal-list").append(element("p", "detail-summary", "從食譜卡選菜，組成這一天的晚餐。"));
      return;
    }
    composition.recipeRefs.forEach((ref, index) => {
      const item = recipe(ref.recipeId, ref.version);
      const history = meal && historyForMeal(meal.id, ref.recipeId);
      const row = element("div", "meal-row");
      const info = element("div");
      info.append(button(item?.title || ref.recipeId, () => openRecipe(ref.recipeId, ref.version), "text-button"),
        element("small", "", `v${ref.version} · ${history ? (history.status === "pending" ? `測試 #${history.testNumber} 待回報` : STATUS[history.status]) : "尚無紀錄"}`));
      const actions = element("div", "meal-row-actions");
      const up = button("↑", () => moveRecipe(composition, index, -1), "icon-button");
      const down = button("↓", () => moveRecipe(composition, index, 1), "icon-button");
      up.disabled = index === 0;
      down.disabled = index === composition.recipeRefs.length - 1;
      actions.append(up, down, button("移除", () => removeRecipe(composition, index), "text-button"));
      row.append(info, actions);
      $("meal-list").append(row);
    });
  }
  async function ensurePending(meal) {
    const existing = await getAll("sessions");
    const pending = meal.recipeRefs.filter((ref) => !existing.some((entry) =>
      entry.mealSessionId === meal.id && entry.recipeId === ref.recipeId)).map((ref) => ({
        id: crypto.randomUUID(), mealSessionId: meal.id, recipeId: ref.recipeId,
        recipeVersion: ref.version,
        testNumber: existing.filter((entry) => entry.recipeId === ref.recipeId).length + 1,
        status: "pending", rating: null, note: ""
      }));
    if (pending.length) await transact("sessions", "readwrite", (tx) =>
      pending.forEach((entry) => tx.objectStore("sessions").put(entry)));
    await refresh();
  }
  async function startMeal() {
    let meal = mealFor(state.activeDate);
    const draft = meal ? null : draftFor(state.activeDate);
    if (!draft && (!meal || meal.status !== "planned")) return;
    try {
      if (draft) {
        meal = {
          id: crypto.randomUUID(), date: state.activeDate, meal: "dinner",
          title: "晚餐", status: "in_progress", recipeRefs: draft.recipeRefs
        };
        await transact(["mealSessions", "meta"], "readwrite", (tx) => {
          tx.objectStore("mealSessions").put(meal);
          tx.objectStore("meta").delete(draft.id);
        });
        await refresh();
      } else {
        meal = { ...meal, status: "in_progress" };
        await persistMeal(meal);
      }
      await ensurePending(meal);
      report("meal-message", "已開始料理；各道菜的測試紀錄仍是待回報。");
    } catch (error) { report("meal-message", `開始失敗：${error.message}`, true); }
  }
  function renderCalendar() {
    const [year, month] = state.calendarMonth.split("-").map(Number);
    $("calendar-month").textContent = `${year} 年 ${month} 月`;
    const grid = $("calendar-grid");
    grid.replaceChildren();
    ["一", "二", "三", "四", "五", "六", "日"].forEach((day) =>
      grid.append(element("span", "calendar-weekday", day)));
    const first = new Date(year, month - 1, 1);
    const offset = (first.getDay() + 6) % 7;
    const days = new Date(year, month, 0).getDate();
    for (let i = 0; i < offset; i++) grid.append(element("span", "calendar-blank"));
    for (let day = 1; day <= days; day++) {
      const date = `${state.calendarMonth}-${String(day).padStart(2, "0")}`;
      const meals = state.meals.filter((entry) => entry.date === date);
      const draft = draftFor(date);
      const standalone = standaloneFor(date);
      const node = button(String(day), () => {
        state.activeDate = date;
        renderMeal();
        renderCalendar();
      }, "calendar-date");
      node.setAttribute("aria-label", `${date}，${meals.length || standalone.length || draft ? [
        ...meals.flatMap((meal) => meal.recipeRefs.map((ref) => recipe(ref.recipeId, ref.version)?.title || ref.recipeId)),
        ...(draft?.recipeRefs.map((ref) => recipe(ref.recipeId, ref.version)?.title || ref.recipeId) || []),
        ...standalone.map((entry) => (recipe(entry.recipeId, entry.recipeVersion) || recipe(entry.recipeId))?.title || entry.recipeId)
      ].join("、") : "無料理紀錄"}`);
      if (date === state.activeDate) node.classList.add("selected");
      if (date === today()) node.classList.add("today");
      if (meals.length || standalone.length || draft) {
        node.classList.add("has-meal");
        node.append(element("span", "calendar-dishes", [
          ...meals.flatMap((meal) => meal.recipeRefs.map((ref) => recipe(ref.recipeId, ref.version)?.title || ref.recipeId)),
          ...(draft?.recipeRefs.map((ref) => recipe(ref.recipeId, ref.version)?.title || ref.recipeId) || []),
          ...standalone.map((entry) => (recipe(entry.recipeId, entry.recipeVersion) || recipe(entry.recipeId))?.title || entry.recipeId)
        ].join("、")));
      }
      grid.append(node);
    }
    renderCalendarDay();
  }
  function standaloneFor(date) {
    return state.histories.filter((entry) => !entry.mealSessionId && entry.createdAt &&
      new Date(entry.createdAt).toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }) === date);
  }
  function renderCalendarDay() {
    clearPhotoUrls("calendar");
    const panel = $("calendar-day");
    panel.replaceChildren(element("h3", "", `${state.activeDate} 的料理`));
    const meals = state.meals.filter((meal) => meal.date === state.activeDate);
    const draft = draftFor(state.activeDate);
    const standalone = standaloneFor(state.activeDate);
    if (!meals.length && !standalone.length && !draft) {
      panel.append(element("p", "detail-summary", "這天還沒有餐次。"));
      return;
    }
    for (const meal of meals) {
      const article = element("article", "calendar-meal");
      article.append(element("h4", "", `${meal.title || "餐次"} · ${STATUS[meal.status] || meal.status}`));
      for (const ref of meal.recipeRefs) {
        const item = recipe(ref.recipeId, ref.version);
        const entry = historyForMeal(meal.id, ref.recipeId);
        article.append(button(`${item?.title || ref.recipeId}（v${ref.version}，${entry?.status === "pending" ? `測試 #${entry.testNumber} 待回報` : entry ? STATUS[entry.status] : "未記錄"}）`,
          () => openRecipe(ref.recipeId, ref.version), "calendar-recipe-link"));
      }
      if (meal.tablePhoto instanceof Blob) article.append(photo(meal.tablePhoto, "整體餐桌照片", "calendar"));
      const label = element("label", "table-photo-label", "整體餐桌照片（只存這個裝置）");
      const input = element("input");
      input.type = "file";
      input.accept = "image/*";
      input.addEventListener("change", async () => {
        const file = input.files[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) return report("meal-message", "請選擇圖片檔案。", true);
        try {
          await persistMeal({ ...meal, tablePhoto: file });
          report("meal-message", "整體餐桌照片已存到這個瀏覽器。");
        } catch (error) { report("meal-message", `照片儲存失敗：${error.message}`, true); }
      });
      label.append(input);
      article.append(label);
      panel.append(article);
    }
    if (draft) {
      const article = element("article", "calendar-meal");
      article.append(element("h4", "", "晚餐草稿 · 待開始"));
      for (const ref of draft.recipeRefs) {
        const item = recipe(ref.recipeId, ref.version);
        article.append(button(`${item?.title || ref.recipeId}（v${ref.version}）`,
          () => openRecipe(ref.recipeId, ref.version), "calendar-recipe-link"));
      }
      panel.append(article);
    }
    for (const entry of standalone) {
      const item = recipe(entry.recipeId, entry.recipeVersion) || recipe(entry.recipeId);
      panel.append(button(`${item?.title || entry.recipeId} · ${STATUS[entry.status] || "已記錄"}`,
        () => openRecipe(entry.recipeId, entry.recipeVersion), "calendar-recipe-link"));
    }
  }
  function renderHistory(recipeId) {
    clearPhotoUrls("history");
    const entries = state.histories.filter((entry) => entry.recipeId === recipeId &&
      (!state.selected?.version || entry.recipeVersion === state.selected.version))
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "") || b.testNumber - a.testNumber);
    $("session-list").replaceChildren();
    if (!entries.length) {
      $("session-list").append(element("p", "detail-summary", "還沒有這道料理的紀錄。"));
      return;
    }
    for (const entry of entries) {
      const card = element("article", "session-card");
      const meta = element("div", "session-meta");
      meta.append(element("span", "", `測試 #${entry.testNumber || "?"} · v${entry.recipeVersion || "待核對"} · ${entry.status === "pending" ? "待回報" : STATUS[entry.status] || "已記錄"}${entry.rating ? ` · ${"★".repeat(entry.rating)}${"☆".repeat(5 - entry.rating)}` : ""}`));
      card.append(meta);
      if (entry.mealSessionId) {
        const meal = state.meals.find((value) => value.id === entry.mealSessionId);
        if (meal) card.append(element("p", "detail-summary", `${meal.date} · ${meal.title}`));
      }
      if (entry.note) card.append(element("p", "", entry.note));
      if (entry.photo instanceof Blob) card.append(photo(entry.photo, `${recipeId} 的料理照片`, "history"));
      if (entry.status === "pending") card.append(button("記錄這道菜的結果", () => {
        state.editHistoryId = entry.id;
        $("session-submit").textContent = `完成測試 #${entry.testNumber}`;
        $("session-form").scrollIntoView({ behavior: "smooth", block: "start" });
      }));
      else {
        card.append(button("刪除紀錄", async () => {
          if (!window.confirm("確定刪除這道菜的紀錄？")) return;
          try {
            const meal = state.meals.find((value) => value.id === entry.mealSessionId);
            await transact(["sessions", "mealSessions"], "readwrite", (tx) => {
              tx.objectStore("sessions").delete(entry.id);
              if (meal?.status === "completed") tx.objectStore("mealSessions").put({ ...meal, status: "in_progress" });
            });
            await refresh();
          } catch (error) { report("session-message", `刪除失敗：${error.message}`, true); }
        }, "delete-button"));
      }
      $("session-list").append(card);
    }
  }
  async function saveHistory(event) {
    event.preventDefault();
    const item = state.selected;
    if (!item) return;
    if (item.kind !== "recipe" && $("session-outcome").value === "validated") {
      return report("session-message", "候選料理尚無可核對的食譜版本，不能標為已驗證。", true);
    }
    const file = $("session-photo").files[0] || null;
    if (file && !file.type.startsWith("image/")) return report("session-message", "請選擇圖片檔案。", true);
    const rating = Number($("session-rating").value);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return report("session-message", "請選擇評分。", true);
    const meal = mealFor(state.activeDate);
    const pending = state.histories.find((entry) => entry.id === state.editHistoryId) ||
      (meal && state.histories.find((entry) => entry.mealSessionId === meal.id &&
        entry.recipeId === item.id && entry.recipeVersion === item.version && entry.status === "pending"));
    const linkedMealId = pending?.mealSessionId ||
      (meal?.recipeRefs.some((ref) => ref.recipeId === item.id && ref.version === item.version) &&
       !historyForMeal(meal.id, item.id) ? meal.id : null);
    const entry = {
      id: pending?.id || crypto.randomUUID(),
      mealSessionId: linkedMealId,
      recipeId: item.id, recipeVersion: item.version || pending?.recipeVersion || "unreviewed",
      testNumber: pending?.testNumber || Math.max(0, ...state.histories.filter((value) => value.recipeId === item.id)
        .map((value) => value.testNumber || 0)) + 1,
      status: $("session-outcome").value, createdAt: new Date().toISOString(),
      rating, note: $("session-note").value.trim(), photo: file || pending?.photo || null
    };
    try {
      await transact("sessions", "readwrite", (tx) => tx.objectStore("sessions").put(entry));
      state.editHistoryId = null;
      $("session-form").reset();
      $("session-submit").textContent = "儲存這道菜的結果";
      await refresh();
      if (entry.mealSessionId) {
        const linked = state.meals.find((value) => value.id === entry.mealSessionId);
        if (linked && linked.recipeRefs.every((ref) => {
          const record = historyForMeal(linked.id, ref.recipeId);
          return record && record.status !== "pending";
        })) await persistMeal({ ...linked, status: "completed" });
      }
      $("detail-status").textContent = STATUS[effectiveStatus(item)];
      $("detail-status").dataset.status = effectiveStatus(item);
      report("session-message", "這道菜的結果已存到這個瀏覽器；請定期下載備份。");
    } catch (error) { report("session-message", `儲存失敗：${error.message}`, true); }
  }
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("照片讀取失敗"));
      reader.readAsDataURL(file);
    });
  }
  async function exportBackup() {
    try {
      const histories = [];
      for (const entry of state.histories) histories.push({
        ...entry, photo: undefined,
        photoDataUrl: entry.photo instanceof Blob ? await fileToDataUrl(entry.photo) : null
      });
      const meals = [];
      for (const meal of state.meals) meals.push({
        ...meal, tablePhoto: undefined,
        tablePhotoDataUrl: meal.tablePhoto instanceof Blob ? await fileToDataUrl(meal.tablePhoto) : null
      });
      const backup = {
        format: "personal-cookbook-backup", version: 2,
        exportedAt: new Date().toISOString(), meals, drafts: state.drafts, sessions: histories
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: "application/json" }));
      const link = element("a");
      link.href = url;
      link.download = `personal-cookbook-backup-${today()}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      report("backup-message", "備份已開始下載，請確認檔案已保存。");
    } catch (error) { report("backup-message", `備份失敗：${error.message}`, true); }
  }
  async function dataUrlToBlob(value) {
    if (value == null) return null;
    if (typeof value !== "string" || !value.startsWith("data:image/")) throw new Error("備份照片格式錯誤");
    return (await fetch(value)).blob();
  }
  async function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (backup?.format !== "personal-cookbook-backup" ||
          ![1, 2].includes(backup.version) || !Array.isArray(backup.sessions) ||
          (backup.version === 2 && !Array.isArray(backup.meals))) throw new Error("不是支援的食譜備份檔");
      const meals = [];
      for (const raw of backup.meals || []) {
        if (typeof raw.id !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date) ||
            !Array.isArray(raw.recipeRefs) || raw.recipeRefs.some((ref) =>
              typeof ref.recipeId !== "string" || typeof ref.version !== "string")) throw new Error("餐次格式錯誤");
        meals.push({ ...raw, tablePhoto: await dataUrlToBlob(raw.tablePhotoDataUrl) });
        delete meals[meals.length - 1].tablePhotoDataUrl;
      }
      const drafts = [];
      for (const raw of backup.drafts || []) {
        if (typeof raw.id !== "string" || !/^draft:\d{4}-\d{2}-\d{2}$/.test(raw.id) ||
            !Array.isArray(raw.recipeRefs) || raw.recipeRefs.some((ref) =>
              typeof ref.recipeId !== "string" || typeof ref.version !== "string")) throw new Error("餐次草稿格式錯誤");
        drafts.push(raw);
      }
      const sessions = [];
      for (const raw of backup.sessions) {
        if (typeof raw.id !== "string" || typeof raw.recipeId !== "string" ||
            (raw.rating !== null && (!Number.isInteger(raw.rating) || raw.rating < 1 || raw.rating > 5)) ||
            typeof raw.note !== "string" || raw.note.length > 2000) throw new Error("料理紀錄格式錯誤");
        const entry = {
          ...raw,
          recipeVersion: raw.recipeVersion || "unreviewed",
          testNumber: raw.testNumber || 1,
          status: raw.status || "tested",
          photo: await dataUrlToBlob(raw.photoDataUrl)
        };
        delete entry.photoDataUrl;
        sessions.push(entry);
      }
      const confirmation = backup.version === 2
        ? "匯入會用備份完整取代本機餐次與料理紀錄。確定繼續？"
        : "匯入舊版備份會覆蓋相同 ID 的料理紀錄。確定繼續？";
      if (!window.confirm(confirmation)) return;
      await transact(["mealSessions", "sessions", "meta"], "readwrite", (tx) => {
        if (backup.version === 2) {
          tx.objectStore("mealSessions").clear();
          tx.objectStore("sessions").clear();
          for (const existing of state.drafts) tx.objectStore("meta").delete(existing.id);
        }
        meals.forEach((meal) => tx.objectStore("mealSessions").put(meal));
        drafts.forEach((draft) => tx.objectStore("meta").put(draft));
        sessions.forEach((entry) => tx.objectStore("sessions").put(entry));
      });
      await refresh();
      report("backup-message", backup.version === 2
        ? "備份已匯入，本機餐次與料理紀錄已更新。"
        : "舊版備份已匯入；相同 ID 的料理紀錄以備份內容為準。");
    } catch (error) { report("backup-message", `匯入失敗：${error.message}`, true); }
    finally { event.target.value = ""; }
  }
  async function registerServiceWorker() {
    const node = $("connection-status");
    if (!("serviceWorker" in navigator) || !["https:", "http:"].includes(location.protocol)) {
      node.textContent = "本機預覽";
      return;
    }
    try {
      navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload());
      await navigator.serviceWorker.register("./sw.js");
      await navigator.serviceWorker.ready;
      node.textContent = navigator.onLine ? "可離線開啟" : "目前離線";
    } catch (error) {
      node.textContent = "離線設定失敗";
      console.error("Service worker registration failed", error);
    }
    window.addEventListener("online", () => { node.textContent = "可離線開啟"; });
    window.addEventListener("offline", () => { node.textContent = "目前離線"; });
  }
  async function init() {
    $("search").addEventListener("input", renderList);
    $("status-filter").addEventListener("change", renderList);
    $("back-button").addEventListener("click", () => { window.location.hash = ""; });
    $("session-form").addEventListener("submit", saveHistory);
    $("start-meal").addEventListener("click", startMeal);
    $("calendar-prev").addEventListener("click", () => shiftMonth(-1));
    $("calendar-next").addEventListener("click", () => shiftMonth(1));
    $("export-button").addEventListener("click", exportBackup);
    $("import-file").addEventListener("change", importBackup);
    window.addEventListener("hashchange", showSelected);
    registerServiceWorker();
    try {
      const [recipes, registry, meals, histories] = await Promise.all([
        fetchJson("./data/recipes.json"), fetchJson("./data/recipe-registry.json"),
        fetchJson("./data/meal-sessions.json"), fetchJson("./data/cooking-history.json")
      ]);
      state.items = validateData(recipes, registry, meals, histories);
      await seedInitial(meals, histories);
      await refresh();
      await showSelected();
    } catch (error) {
      $("load-error").textContent = `資料載入失敗：${error.message}`;
      $("load-error").hidden = false;
      $("connection-status").textContent = "資料讀取失敗";
    }
  }
  function shiftMonth(offset) {
    const [year, month] = state.calendarMonth.split("-").map(Number);
    const next = new Date(year, month - 1 + offset, 1);
    state.calendarMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    const preferredDay = Number(state.activeDate.slice(-2));
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    state.activeDate = `${state.calendarMonth}-${String(Math.min(preferredDay, lastDay)).padStart(2, "0")}`;
    renderMeal();
    renderCalendar();
  }
  init();
})();
