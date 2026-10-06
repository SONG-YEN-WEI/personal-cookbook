(() => {
  "use strict";

  const STATUS = {
    validated: "已驗證",
    tested: "做過，待整理",
    needs_revision: "做過，待修訂",
    unreviewed: "待核對"
  };
  const $ = (id) => document.getElementById(id);
  const state = { items: [], selected: null, photoUrls: [] };
  let dbPromise;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function badge(status) {
    const node = element("span", "status-badge", STATUS[status]);
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

  function validateItems(recipes, registry) {
    if (!Array.isArray(recipes) || !Array.isArray(registry)) {
      throw new Error("食譜資料格式錯誤：資料檔必須是陣列。");
    }
    const ids = new Set();
    const items = [];
    for (const [kind, source] of [["recipe", recipes], ["candidate", registry]]) {
      for (const entry of source) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
            typeof entry.id !== "string" || !entry.id.trim() ||
            typeof entry.title !== "string" || !entry.title.trim() ||
            !Object.hasOwn(STATUS, entry.status)) {
          throw new Error(`食譜資料格式錯誤：${kind} 有缺少 ID、名稱或無效狀態。`);
        }
        if (ids.has(entry.id)) throw new Error(`食譜資料格式錯誤：重複的 ID ${entry.id}。`);
        if (kind === "recipe" && (!Array.isArray(entry.ingredients) || !Array.isArray(entry.steps))) {
          throw new Error(`食譜資料格式錯誤：${entry.id} 缺少食材或步驟陣列。`);
        }
        ids.add(entry.id);
        items.push({ ...entry, kind });
      }
    }
    return items;
  }

  function renderList() {
    const query = $("search").value.trim().toLocaleLowerCase("zh-Hant");
    const status = $("status-filter").value;
    const filtered = state.items.filter((item) => {
      const haystack = [item.title, item.category, item.method, item.summary].filter(Boolean).join(" ").toLocaleLowerCase("zh-Hant");
      return (status === "all" || item.status === status) && (!query || haystack.includes(query));
    });
    $("recipe-list").replaceChildren();
    $("result-count").textContent = `${filtered.length} 道料理`;
    $("empty-state").hidden = filtered.length > 0;

    for (const item of filtered) {
      const card = element("button", "recipe-card");
      card.type = "button";
      card.setAttribute("aria-label", `查看${item.title}，${STATUS[item.status]}`);
      const top = element("div", "card-top");
      top.append(element("span", "eyebrow", item.category || "未分類"), badge(item.status));
      card.append(top, element("h3", "", item.title));
      card.append(element("p", "", item.summary || (item.kind === "candidate" ? "僅有來源線索，尚無可照做的食譜。" : "已整理的食譜")));
      const footer = element("div", "card-footer");
      footer.append(element("span", "", item.method || "料理方式待核對"), element("span", "", "查看 →"));
      card.append(footer);
      card.addEventListener("click", () => { window.location.hash = encodeURIComponent(item.id); });
      $("recipe-list").append(card);
    }
  }

  function detailBlock(title, entries, ordered = false) {
    const block = element("section", "detail-block");
    block.append(element("h3", "", title));
    const list = element(ordered ? "ol" : "ul");
    for (const value of entries) list.append(element("li", "", value));
    block.append(list);
    return block;
  }

  function clearPhotoUrls() {
    state.photoUrls.forEach((url) => URL.revokeObjectURL(url));
    state.photoUrls = [];
  }

  async function showSelected() {
    let id;
    try { id = decodeURIComponent(window.location.hash.slice(1)); }
    catch { id = ""; }
    const item = state.items.find((entry) => entry.id === id);
    state.selected = item || null;
    $("detail").hidden = !item;
    if (!item) {
      clearPhotoUrls();
      return;
    }
    $("detail-kicker").textContent = `${item.category || "未分類"} · ${item.method || "做法待核對"}`;
    $("detail-title").textContent = item.title;
    $("detail-summary").textContent = item.summary || "";
    $("detail-status").textContent = STATUS[item.status];
    $("detail-status").dataset.status = item.status;
    const content = $("detail-content");
    content.replaceChildren();

    if (item.kind === "candidate") {
      content.append(element("p", "notice", "這是從料理對話整理的候選條目，尚未核對成可照做的食譜。請勿把 AI 回答當成已驗證做法。"));
      if (item.evidence) {
        const block = element("section", "detail-block");
        block.append(element("h3", "", "來源線索（節錄或摘要）"), element("blockquote", "source-quote", item.evidence));
        content.append(block);
      }
      if (item.reviewNote) content.append(detailBlock("待確認", [item.reviewNote]));
    } else {
      if (item.status !== "validated") content.append(element("p", "notice", "這份做法尚未由你的實作結果驗證；下廚時請自行確認食材熟度與安全。"));
      if (item.ingredients.length) {
        content.append(detailBlock("食材", item.ingredients.map((ingredient) => `${ingredient.name}${ingredient.amount ? `　${ingredient.amount}` : ""}`)));
      }
      if (item.steps.length) content.append(detailBlock("料理步驟", item.steps.map((step) => step.text), true));
    }
    report("session-message", "");
    try {
      await renderSessions(item.id);
    } catch (error) {
      report("session-message", `無法讀取本機料理紀錄：${error.message}`, true);
    }
    $("detail").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) return reject(new Error("此瀏覽器不支援 IndexedDB"));
        const request = indexedDB.open("personal-cookbook", 1);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore("sessions", { keyPath: "id" });
          store.createIndex("recipeId", "recipeId");
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("資料庫開啟失敗"));
      });
    }
    return dbPromise;
  }

  async function databaseAction(mode, action) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("sessions", mode);
      let result;
      try { result = action(tx.objectStore("sessions"), tx); }
      catch (error) { tx.abort(); reject(error); return; }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("資料庫操作失敗"));
      tx.onabort = () => reject(tx.error || new Error("資料庫操作已取消"));
    });
  }

  async function allSessions() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction("sessions", "readonly").objectStore("sessions").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("讀取失敗"));
    });
  }

  async function sessionsFor(recipeId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction("sessions", "readonly").objectStore("sessions").index("recipeId").getAll(recipeId);
      request.onsuccess = () => resolve(request.result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      request.onerror = () => reject(request.error || new Error("讀取失敗"));
    });
  }

  async function renderSessions(recipeId) {
    const entries = await sessionsFor(recipeId);
    if (state.selected?.id !== recipeId) return;
    clearPhotoUrls();
    $("session-list").replaceChildren();
    if (!entries.length) {
      $("session-list").append(element("p", "detail-summary", "還沒有這道料理的本機紀錄。"));
      return;
    }
    for (const entry of entries) {
      const card = element("article", "session-card");
      const meta = element("div", "session-meta");
      const date = new Date(entry.createdAt);
      meta.append(element("span", "", `${Number.isNaN(date.getTime()) ? entry.createdAt : date.toLocaleString("zh-TW")} · ${"★".repeat(entry.rating)}${"☆".repeat(5 - entry.rating)}`));
      const remove = element("button", "delete-button", "刪除");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        if (!window.confirm("確定刪除這筆料理紀錄？")) return;
        try {
          await databaseAction("readwrite", (store) => { store.delete(entry.id); });
          await renderSessions(recipeId);
          report("session-message", "料理紀錄已刪除。");
        } catch (error) { report("session-message", `刪除失敗：${error.message}`, true); }
      });
      meta.append(remove);
      card.append(meta);
      if (entry.note) card.append(element("p", "", entry.note));
      if (entry.photo instanceof Blob) {
        const image = element("img");
        const url = URL.createObjectURL(entry.photo);
        state.photoUrls.push(url);
        image.src = url;
        image.alt = "這次料理的照片";
        image.loading = "lazy";
        card.append(image);
      }
      $("session-list").append(card);
    }
  }

  async function saveSession(event) {
    event.preventDefault();
    if (!state.selected) return;
    const photo = $("session-photo").files[0] || null;
    if (photo && !photo.type.startsWith("image/")) return report("session-message", "請選擇圖片檔案。", true);
    const entry = {
      id: crypto.randomUUID(),
      recipeId: state.selected.id,
      createdAt: new Date().toISOString(),
      rating: Number($("session-rating").value),
      note: $("session-note").value.trim(),
      photo
    };
    try {
      await databaseAction("readwrite", (store) => { store.put(entry); });
      $("session-form").reset();
      report("session-message", "已儲存在這個瀏覽器。請定期下載備份。");
      await renderSessions(entry.recipeId);
    } catch (error) {
      report("session-message", `儲存失敗：${error.message}。請檢查瀏覽器儲存空間。`, true);
    }
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
      const entries = await allSessions();
      const serialized = [];
      for (const entry of entries) {
        serialized.push({
          id: entry.id,
          recipeId: entry.recipeId,
          createdAt: entry.createdAt,
          rating: entry.rating,
          note: entry.note,
          photoDataUrl: entry.photo instanceof Blob ? await fileToDataUrl(entry.photo) : null
        });
      }
      const backup = { format: "personal-cookbook-backup", version: 1, exportedAt: new Date().toISOString(), sessions: serialized };
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: "application/json" }));
      const link = element("a");
      link.href = url;
      link.download = `personal-cookbook-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      report("backup-message", "備份已開始下載。請確認檔案有存到你的裝置。");
    } catch (error) { report("backup-message", `備份失敗：${error.message}`, true); }
  }

  async function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (backup?.format !== "personal-cookbook-backup" || backup.version !== 1 || !Array.isArray(backup.sessions)) {
        throw new Error("不是支援的食譜備份檔");
      }
      const entries = [];
      for (const raw of backup.sessions) {
        if (typeof raw.id !== "string" || typeof raw.recipeId !== "string" ||
            typeof raw.createdAt !== "string" || !Number.isInteger(raw.rating) || raw.rating < 1 || raw.rating > 5 ||
            typeof raw.note !== "string" || raw.note.length > 2000 ||
            (raw.photoDataUrl != null && (typeof raw.photoDataUrl !== "string" || !raw.photoDataUrl.startsWith("data:image/")))) {
          throw new Error("備份裡有格式不正確的料理紀錄");
        }
        const photo = raw.photoDataUrl ? await (await fetch(raw.photoDataUrl)).blob() : null;
        entries.push({ id: raw.id, recipeId: raw.recipeId, createdAt: raw.createdAt, rating: raw.rating, note: raw.note, photo });
      }
      if (!window.confirm("匯入會以備份中的資料覆蓋相同 ID 的本機紀錄。確定繼續？")) return;
      await databaseAction("readwrite", (store) => { entries.forEach((entry) => store.put(entry)); });
      if (state.selected) await renderSessions(state.selected.id);
      report("backup-message", "備份已匯入；相同 ID 的紀錄以備份內容為準。");
    } catch (error) { report("backup-message", `匯入失敗：${error.message}`, true); }
    finally { event.target.value = ""; }
  }

  async function registerServiceWorker() {
    const status = $("connection-status");
    if (!("serviceWorker" in navigator) || !["https:", "http:"].includes(location.protocol)) {
      status.textContent = "本機預覽";
      return;
    }
    try {
      await navigator.serviceWorker.register("./sw.js");
      await navigator.serviceWorker.ready;
      status.textContent = navigator.onLine ? "可離線開啟" : "目前離線";
    } catch (error) {
      status.textContent = "離線設定失敗";
      console.error("Service worker registration failed", error);
    }
    window.addEventListener("online", () => { status.textContent = "可離線開啟"; });
    window.addEventListener("offline", () => { status.textContent = "目前離線"; });
  }

  async function init() {
    $("search").addEventListener("input", renderList);
    $("status-filter").addEventListener("change", renderList);
    $("back-button").addEventListener("click", () => { window.location.hash = ""; });
    $("session-form").addEventListener("submit", saveSession);
    $("export-button").addEventListener("click", exportBackup);
    $("import-file").addEventListener("change", importBackup);
    window.addEventListener("hashchange", showSelected);
    registerServiceWorker();
    try {
      const [recipes, registry] = await Promise.all([
        fetchJson("./data/recipes.json"),
        fetchJson("./data/recipe-registry.json")
      ]);
      state.items = validateItems(recipes, registry);
      renderList();
      await showSelected();
    } catch (error) {
      $("load-error").textContent = `資料載入失敗：${error.message}。請確認資料檔存在且格式正確。`;
      $("load-error").hidden = false;
      $("empty-state").hidden = true;
      $("connection-status").textContent = "資料讀取失敗";
    }
  }

  init();
})();
