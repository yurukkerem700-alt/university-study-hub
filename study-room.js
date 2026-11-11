/* Notora — Çalışma Defteri
   Öğrenci kendi ders notunu yazar, okurken önemli yerleri renkle işaretler,
   işaretten bilgi kartı üretir ve kartları aralıklı tekrarla çalışır.
   Giriş yapılmışsa Supabase'e (RLS ile kişiye özel), yapılmamışsa bu cihaza kaydedilir.
   app.js'teki db, getSession, showToast, openModal, $ ve $$ kullanılır. */
(function () {
  "use strict";

  const LOCAL_KEY = "notora_study_v1";
  const COLORS = [
    { id: "yellow", label: "Önemli", hint: "Mutlaka bilinmesi gereken yer" },
    { id: "green", label: "Biliyorum", hint: "Anladığım, oturmuş konu" },
    { id: "blue", label: "Sınavda çıkar", hint: "Hocanın vurguladığı yer" },
    { id: "pink", label: "Anlamadım", hint: "Tekrar bakmam gereken yer" },
  ];
  const BOX_DAYS = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };
  const TABLES = { nb: "study_notebooks", hl: "study_highlights", fc: "study_flashcards" };

  const S = {
    uid: null,
    t: { study_notebooks: [], study_highlights: [], study_flashcards: [] },
    activeId: null,
    view: "read",
    sel: null,
    focusHl: null,
    search: "",
    rev: null,
    loaded: false,
    saveTimer: null,
  };

  const $r = (id) => document.getElementById(id);
  const today = () => new Date().toLocaleDateString("sv-SE");
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  /* ---------- Depolama (hesap veya cihaz) ---------- */
  function readLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null");
      if (raw && raw.t) return raw;
    } catch (e) { /* bozuk veri yok sayılır */ }
    return { t: { study_notebooks: [], study_highlights: [], study_flashcards: [] }, seq: 0 };
  }
  function writeLocal() {
    if (S.uid) return;
    try {
      const cur = readLocal();
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ t: S.t, seq: cur.seq }));
    } catch (e) { showToast("Bu cihazda kaydedilemedi (depolama dolu olabilir)."); }
  }
  function nextLocalId() {
    const cur = readLocal();
    cur.seq = (cur.seq || 0) + 1;
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ t: S.t, seq: cur.seq })); } catch (e) { /* yoksay */ }
    return cur.seq;
  }
  function fail(error, what) {
    console.warn(what, error);
    showToast((what || "İşlem") + " başarısız oldu. Bağlantını kontrol edip tekrar dene.");
  }

  async function insertRow(table, row) {
    if (S.uid) {
      const { data, error } = await db.from(table).insert(row).select().single();
      if (error) { fail(error, "Kaydetme"); return null; }
      S.t[table].push(data);
      return data;
    }
    const full = { ...row, id: nextLocalId(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    S.t[table].push(full);
    writeLocal();
    return full;
  }
  async function updateRow(table, id, patch) {
    const row = S.t[table].find((r) => r.id === id);
    if (!row) return false;
    if (S.uid) {
      const { error } = await db.from(table).update(patch).eq("id", id);
      if (error) { fail(error, "Güncelleme"); return false; }
    }
    Object.assign(row, patch);
    writeLocal();
    return true;
  }
  async function removeRow(table, id) {
    if (S.uid) {
      const { error } = await db.from(table).delete().eq("id", id);
      if (error) { fail(error, "Silme"); return false; }
    }
    S.t[table] = S.t[table].filter((r) => r.id !== id);
    writeLocal();
    return true;
  }

  async function loadAll() {
    const session = await getSession();
    S.uid = session?.user?.id || null;
    if (S.uid) {
      const [a, b, c] = await Promise.all([
        db.from(TABLES.nb).select("*").order("updated_at", { ascending: false }),
        db.from(TABLES.hl).select("*").order("start_pos"),
        db.from(TABLES.fc).select("*").order("next_review"),
      ]);
      if (a.error || b.error || c.error) { fail(a.error || b.error || c.error, "Defterler yüklenemedi:"); }
      S.t.study_notebooks = a.data || [];
      S.t.study_highlights = b.data || [];
      S.t.study_flashcards = c.data || [];
      await migrateLocal();
    } else {
      S.t = readLocal().t;
    }
    if (!S.t.study_notebooks.some((n) => n.id === S.activeId)) S.activeId = null;
    S.loaded = true;
  }

  /* Misafirken yazılanlar, giriş yapınca hesaba taşınır. */
  async function migrateLocal() {
    const local = readLocal();
    if (!local.t.study_notebooks.length) return;
    let moved = 0;
    for (const nb of local.t.study_notebooks) {
      const { data, error } = await db.from(TABLES.nb)
        .insert({ title: nb.title, course: nb.course || null, body: nb.body || "" }).select().single();
      if (error || !data) continue;
      S.t.study_notebooks.unshift(data);
      moved++;
      for (const x of local.t.study_highlights.filter((r) => r.notebook_id === nb.id)) {
        const r = await db.from(TABLES.hl).insert({ notebook_id: data.id, start_pos: x.start_pos, end_pos: x.end_pos, color: x.color, important: !!x.important, comment: x.comment || null }).select().single();
        if (r.data) S.t.study_highlights.push(r.data);
      }
      for (const x of local.t.study_flashcards.filter((r) => r.notebook_id === nb.id)) {
        const r = await db.from(TABLES.fc).insert({ notebook_id: data.id, front: x.front, back: x.back, box: x.box || 1, next_review: x.next_review || today() }).select().single();
        if (r.data) S.t.study_flashcards.push(r.data);
      }
    }
    if (moved === local.t.study_notebooks.length) {
      try { localStorage.removeItem(LOCAL_KEY); } catch (e) { /* yoksay */ }
      showToast("Bu cihazdaki defterlerin hesabına aktarıldı.");
    }
  }

  /* ---------- Yardımcılar ---------- */
  const active = () => S.t.study_notebooks.find((n) => n.id === S.activeId) || null;
  const hlOf = (id) => S.t.study_highlights.filter((x) => x.notebook_id === id).sort((a, b) => a.start_pos - b.start_pos);
  const cardsOf = (id) => S.t.study_flashcards.filter((x) => x.notebook_id === id);
  const dueCards = (id) => S.t.study_flashcards.filter((x) => (id == null || x.notebook_id === id) && x.next_review <= today());

  /* Metin değişince işaretlerin yerini kaydır; değişen bölgedekileri sil. */
  function shiftHighlights(oldText, newText, list) {
    let p = 0;
    const max = Math.min(oldText.length, newText.length);
    while (p < max && oldText[p] === newText[p]) p++;
    let s = 0;
    while (s < max - p && oldText[oldText.length - 1 - s] === newText[newText.length - 1 - s]) s++;
    const oldEnd = oldText.length - s;
    const delta = (newText.length - s) - oldEnd;
    const keep = [], drop = [], move = [];
    for (const x of list) {
      if (x.end_pos <= p) keep.push(x);
      else if (x.start_pos >= oldEnd) { if (delta) move.push({ x, start_pos: x.start_pos + delta, end_pos: x.end_pos + delta }); else keep.push(x); }
      else drop.push(x);
    }
    return { move, drop };
  }

  /* ---------- Görünüm ---------- */
  function renderAll() {
    renderStatus();
    renderList();
    renderMain();
  }

  function renderStatus() {
    const el = $r("srStatus");
    if (!el) return;
    el.textContent = S.uid ? "Hesabınla senkron — her cihazda aynı defter" : "Bu cihazda saklanıyor — giriş yapınca hesabına taşınır";
    el.classList.toggle("sr-on", !!S.uid);
  }

  function renderList() {
    const box = $r("srList");
    if (!box) return;
    box.replaceChildren();
    const q = S.search.trim().toLocaleLowerCase("tr");
    const items = [...S.t.study_notebooks]
      .filter((n) => !q || (n.title + " " + (n.course || "")).toLocaleLowerCase("tr").includes(q))
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    if (!items.length) {
      box.append(h("p", { class: "sr-muted", text: S.t.study_notebooks.length ? "Eşleşen defter yok." : "Henüz defterin yok. İlk dersini ekle." }));
      return;
    }
    for (const n of items) {
      const due = dueCards(n.id).length;
      box.append(h("button", {
        type: "button",
        class: "sr-item" + (n.id === S.activeId ? " active" : ""),
        onclick: () => { S.activeId = n.id; S.view = "read"; S.sel = null; S.focusHl = null; S.rev = null; renderAll(); },
      },
        h("b", { text: n.title }),
        h("small", { text: [n.course, hlOf(n.id).length + " işaret", cardsOf(n.id).length + " kart"].filter(Boolean).join(" · ") }),
        due ? h("span", { class: "sr-badge", text: due + " tekrar" }) : null,
      ));
    }
  }

  function renderMain() {
    const main = $r("srMain");
    if (!main) return;
    main.replaceChildren();
    const nb = active();
    if (!nb) { main.append(emptyState()); return; }

    const head = h("div", { class: "sr-head" },
      h("div", {},
        h("h3", { text: nb.title }),
        h("small", { class: "sr-muted", text: nb.course || "Ders belirtilmedi" })),
      h("div", { class: "sr-head-actions" },
        h("button", { type: "button", class: "text-btn", onclick: renameNotebook }, "Adı değiştir"),
        h("button", { type: "button", class: "text-btn sr-danger", onclick: deleteNotebook }, "Sil")));

    const due = dueCards(nb.id).length;
    const tabs = h("div", { class: "sr-tabs", role: "tablist" },
      tabBtn("read", "Oku ve işaretle"),
      tabBtn("write", "Yaz / düzenle"),
      tabBtn("cards", "Kartlar" + (due ? " (" + due + " tekrar)" : "")));

    main.append(head, tabs);
    if (S.view === "write") main.append(writeView(nb));
    else if (S.view === "cards") main.append(cardsView(nb));
    else main.append(readView(nb));
  }

  function tabBtn(id, label) {
    return h("button", {
      type: "button", role: "tab", class: "tab" + (S.view === id ? " active" : ""),
      onclick: () => { S.view = id; S.sel = null; S.focusHl = null; S.rev = null; renderMain(); },
    }, label);
  }

  function emptyState() {
    return h("div", { class: "sr-empty" },
      h("h3", { text: "Çalışma defterin hazır." }),
      h("p", { text: "Soldan bir defter aç. Ders notunu yaz ya da slayt/PDF'ten kopyaladığın metni yapıştır; sonra okurken önemli yerleri renkle işaretle." }),
      h("ul", { class: "sr-tips" },
        h("li", {}, h("b", { text: "İşaretle: " }), "Metni seç, rengi tıkla. Sarı önemli, yeşil biliyorum, mavi sınavda çıkar, pembe anlamadım."),
        h("li", {}, h("b", { text: "★ Çok önemli: " }), "En kritik yerlere yıldız ekle, özet listende en üstte görünür."),
        h("li", {}, h("b", { text: "Kart yap: " }), "Seçtiğin cümleden soru-cevap kartı üret, aralıklı tekrarla ezberle."),
        h("li", {}, h("b", { text: "Odaklan: " }), "Çalışma sekmesindeki Pomodoro ile süre tut.")));
  }

  /* ----- Oku ve işaretle ----- */
  function readView(nb) {
    const wrap = h("div", { class: "sr-read" });
    const hls = hlOf(nb.id);

    const bar = h("div", { class: "sr-toolbar" });
    const selInfo = h("span", { class: "sr-selinfo", id: "srSelInfo", text: "Bir yeri seç, sonra renge dokun." });
    bar.append(selInfo);
    const sw = h("div", { class: "sr-swatches" });
    for (const c of COLORS) {
      sw.append(h("button", {
        type: "button", class: "sr-sw sr-" + c.id, title: c.hint, "aria-label": c.label,
        onmousedown: (e) => e.preventDefault(),
        onclick: () => applyColor(c.id),
      }, c.label));
    }
    bar.append(sw,
      h("button", { type: "button", class: "secondary-btn", id: "srStar", onmousedown: (e) => e.preventDefault(), onclick: toggleStar }, "★ Çok önemli"),
      h("button", { type: "button", class: "secondary-btn", onmousedown: (e) => e.preventDefault(), onclick: makeCardFromSelection }, "Kart yap"));
    wrap.append(bar);

    const focusBox = h("div", { class: "sr-focus hidden", id: "srFocus" });
    wrap.append(focusBox);

    const reader = h("div", { class: "sr-reader", id: "srReader", tabindex: "0" });
    if (!nb.body.trim()) {
      reader.append(h("p", { class: "sr-muted", text: "Defter boş. “Yaz / düzenle” sekmesinden ders notunu yaz veya yapıştır." }));
    } else {
      let pos = 0;
      for (const x of hls) {
        if (x.start_pos > pos) reader.append(h("span", { "data-s": pos }, nb.body.slice(pos, x.start_pos)));
        const mark = h("mark", {
          "data-s": x.start_pos, "data-hl": x.id,
          class: "hl hl-" + x.color + (x.important ? " hl-star" : "") + (x.comment ? " hl-note" : "") + (x.id === S.focusHl ? " hl-focus" : ""),
          title: x.comment || COLORS.find((c) => c.id === x.color)?.label || "",
        }, nb.body.slice(x.start_pos, x.end_pos));
        reader.append(mark);
        pos = x.end_pos;
      }
      if (pos < nb.body.length) reader.append(h("span", { "data-s": pos }, nb.body.slice(pos)));
      reader.addEventListener("click", onReaderClick);
    }
    wrap.append(reader, summaryPanel(nb, hls));
    queueMicrotask(() => { renderFocus(); updateSelInfo(); });
    return wrap;
  }

  function summaryPanel(nb, hls) {
    const box = h("div", { class: "sr-summary" });
    box.append(h("div", { class: "sr-sum-head" },
      h("b", { text: "İşaretlediklerim (" + hls.length + ")" }),
      hls.length ? h("button", { type: "button", class: "text-btn", onclick: copySummary }, "Özeti kopyala") : null));
    if (!hls.length) { box.append(h("p", { class: "sr-muted", text: "Henüz işaret yok. Okurken önemli yerleri seçip renkle işaretle." })); return box; }
    const order = [...hls].sort((a, b) => (b.important - a.important) || (a.start_pos - b.start_pos));
    const list = h("ul", { class: "sr-sum-list" });
    for (const x of order) {
      const label = nb.body.slice(x.start_pos, x.end_pos);
      list.append(h("li", {},
        h("button", { type: "button", class: "sr-sum-item sr-" + x.color, onclick: () => jumpTo(x.id) },
          (x.important ? "★ " : "") + (label.length > 140 ? label.slice(0, 140) + "…" : label)),
        x.comment ? h("small", { class: "sr-muted", text: "Not: " + x.comment }) : null));
    }
    box.append(list);
    return box;
  }

  function jumpTo(id) {
    S.focusHl = id;
    renderMain();
    requestAnimationFrame(() => document.querySelector('mark[data-hl="' + id + '"]')?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }

  async function copySummary() {
    const nb = active();
    if (!nb) return;
    const lines = [...hlOf(nb.id)].sort((a, b) => (b.important - a.important) || (a.start_pos - b.start_pos)).map((x) => {
      const c = COLORS.find((k) => k.id === x.color)?.label || "";
      return (x.important ? "★ " : "• ") + "[" + c + "] " + nb.body.slice(x.start_pos, x.end_pos).replace(/\s+/g, " ").trim() + (x.comment ? " (Not: " + x.comment + ")" : "");
    });
    try { await navigator.clipboard.writeText(nb.title + "\n\n" + lines.join("\n")); showToast("Özet panoya kopyalandı."); }
    catch (e) { showToast("Kopyalanamadı; tarayıcı izin vermedi."); }
  }

  /* Seçimi metindeki karakter konumuna çevir. */
  function posOf(node, off) {
    const reader = $r("srReader");
    if (!reader) return null;
    if (node.nodeType === 3) {
      const el = node.parentElement?.closest("[data-s]");
      return el && reader.contains(el) ? Number(el.dataset.s) + off : null;
    }
    const segs = [...node.querySelectorAll ? node.querySelectorAll("[data-s]") : []];
    if (off < node.childNodes.length) {
      const child = node.childNodes[off];
      const target = child.nodeType === 1 ? (child.matches("[data-s]") ? child : child.querySelector("[data-s]")) : null;
      if (target) return Number(target.dataset.s);
    }
    const last = segs[segs.length - 1];
    return last ? Number(last.dataset.s) + last.textContent.length : null;
  }

  function captureSelection() {
    const reader = $r("srReader");
    const sel = window.getSelection();
    if (!reader || !sel || !sel.rangeCount || sel.isCollapsed) return;
    const r = sel.getRangeAt(0);
    if (!reader.contains(r.commonAncestorContainer)) return;
    const a = posOf(r.startContainer, r.startOffset);
    const b = posOf(r.endContainer, r.endOffset);
    const nb = active();
    if (a == null || b == null || !nb) return;
    let start = Math.min(a, b), end = Math.max(a, b);
    while (start < end && /\s/.test(nb.body[start])) start++;
    while (end > start && /\s/.test(nb.body[end - 1])) end--;
    if (end <= start) return;
    S.sel = { start, end };
    S.focusHl = null;
    renderFocus();
    updateSelInfo();
  }

  function updateSelInfo() {
    const el = $r("srSelInfo");
    if (!el) return;
    el.textContent = S.sel ? (S.sel.end - S.sel.start) + " karakter seçili — bir renge dokun." : (S.focusHl ? "İşaret seçili — renk değiştirebilir veya kaldırabilirsin." : "Bir yeri seç, sonra renge dokun.");
  }

  function onReaderClick(e) {
    const mark = e.target.closest?.("mark[data-hl]");
    if (!mark) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    S.sel = null;
    S.focusHl = Number(mark.dataset.hl);
    renderMain();
  }

  function renderFocus() {
    const box = $r("srFocus");
    if (!box) return;
    const x = S.t.study_highlights.find((r) => r.id === S.focusHl);
    box.replaceChildren();
    box.classList.toggle("hidden", !x);
    const star = $r("srStar");
    if (star) star.classList.toggle("on", !!x?.important);
    if (!x) return;
    const input = h("input", { type: "text", maxlength: "200", placeholder: "Bu işarete kısa not ekle (örn. vizede çıkmıştı)", value: x.comment || "" });
    input.addEventListener("change", async () => { if (await updateRow(TABLES.hl, x.id, { comment: input.value.trim() || null })) renderMain(); });
    box.append(
      h("b", { text: "Seçili işaret" }), input,
      h("button", { type: "button", class: "secondary-btn", onclick: async () => { const id = x.id; if (await removeRow(TABLES.hl, id)) { S.focusHl = null; renderMain(); renderList(); } } }, "İşareti kaldır"));
  }

  async function applyColor(color) {
    const nb = active();
    if (!nb) return;
    if (S.sel) {
      const { start, end } = S.sel;
      const overlapped = hlOf(nb.id).filter((x) => x.start_pos < end && x.end_pos > start);
      for (const x of overlapped) await removeRow(TABLES.hl, x.id);
      const row = await insertRow(TABLES.hl, { notebook_id: nb.id, start_pos: start, end_pos: end, color, important: false, comment: null });
      if (row) { S.focusHl = row.id; S.sel = null; window.getSelection()?.removeAllRanges(); touch(nb); renderMain(); renderList(); }
    } else if (S.focusHl) {
      if (await updateRow(TABLES.hl, S.focusHl, { color })) renderMain();
    } else {
      showToast("Önce metinde işaretlemek istediğin yeri seç.");
    }
  }

  async function toggleStar() {
    let x = S.t.study_highlights.find((r) => r.id === S.focusHl);
    if (!x && S.sel) {
      const nb = active();
      x = await insertRow(TABLES.hl, { notebook_id: nb.id, start_pos: S.sel.start, end_pos: S.sel.end, color: "yellow", important: true, comment: null });
      if (x) { S.focusHl = x.id; S.sel = null; window.getSelection()?.removeAllRanges(); renderMain(); renderList(); }
      return;
    }
    if (!x) { showToast("Önce bir yer seç veya bir işarete dokun."); return; }
    if (await updateRow(TABLES.hl, x.id, { important: !x.important })) renderMain();
  }

  async function makeCardFromSelection() {
    const nb = active();
    if (!nb) return;
    let text = "";
    if (S.sel) text = nb.body.slice(S.sel.start, S.sel.end);
    else if (S.focusHl) { const x = S.t.study_highlights.find((r) => r.id === S.focusHl); if (x) text = nb.body.slice(x.start_pos, x.end_pos); }
    if (!text) { showToast("Kart için önce bir yer seç."); return; }
    S.view = "cards";
    S.cardDraft = { front: "", back: text.trim() };
    renderMain();
  }

  async function touch(nb) { await updateRow(TABLES.nb, nb.id, { updated_at: new Date().toISOString() }); }

  /* ----- Yaz / düzenle ----- */
  function writeView(nb) {
    const wrap = h("div", { class: "sr-write" });
    const ta = h("textarea", { id: "srBody", rows: "18", placeholder: "Ders notunu buraya yaz veya yapıştır. Slayt, PDF ya da kitaptan kopyalayabilirsin.", spellcheck: "true" });
    ta.value = nb.body;
    const status = h("small", { class: "sr-muted", id: "srSave", text: nb.body.length + " karakter" });
    ta.addEventListener("input", () => {
      status.textContent = "Kaydediliyor…";
      clearTimeout(S.saveTimer);
      const id = nb.id;
      S.saveTimer = setTimeout(() => saveBody(id, ta.value, status), 700);
    });
    wrap.append(ta, status,
      h("p", { class: "sr-muted", text: "Metni değiştirince, değişmeyen yerlerdeki işaretlerin korunur; düzenlediğin cümlelerin işareti silinir." }));
    return wrap;
  }

  async function saveBody(id, text, statusEl) {
    const nb = S.t.study_notebooks.find((n) => n.id === id);
    if (!nb || nb.body === text) { if (statusEl) statusEl.textContent = text.length + " karakter"; return; }
    const old = nb.body;
    const { move, drop } = shiftHighlights(old, text, hlOf(id));
    const ok = await updateRow(TABLES.nb, id, { body: text, updated_at: new Date().toISOString() });
    if (!ok) { if (statusEl) statusEl.textContent = "Kaydedilemedi"; return; }
    for (const x of drop) await removeRow(TABLES.hl, x.id);
    for (const m of move) await updateRow(TABLES.hl, m.x.id, { start_pos: m.start_pos, end_pos: m.end_pos });
    if (statusEl) statusEl.textContent = "Kaydedildi · " + text.length + " karakter";
    renderList();
  }

  /* ----- Kartlar ----- */
  function cardsView(nb) {
    const wrap = h("div", { class: "sr-cards" });
    const due = dueCards(nb.id);

    if (S.rev) { wrap.append(reviewView()); return wrap; }

    wrap.append(h("div", { class: "sr-card-top" },
      h("div", {}, h("b", { text: due.length + " kart tekrar bekliyor" }), h("small", { class: "sr-muted", text: " · toplam " + cardsOf(nb.id).length })),
      due.length ? h("button", { type: "button", class: "primary-btn", onclick: () => startReview(due.map((c) => c.id)) }, "Tekrarı başlat") : null));

    const draft = S.cardDraft || { front: "", back: "" };
    const front = h("textarea", { rows: "2", maxlength: "400", placeholder: "Soru (örn. Normalizasyon neyi azaltır?)" }); front.value = draft.front;
    const back = h("textarea", { rows: "3", maxlength: "800", placeholder: "Cevap" }); back.value = draft.back;
    const form = h("form", { class: "sr-card-form" },
      h("b", { text: "Yeni kart" }), front, back,
      h("button", { class: "primary-btn", type: "submit" }, "Kartı ekle"));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!front.value.trim() || !back.value.trim()) { showToast("Kartın hem sorusu hem cevabı olmalı."); return; }
      const row = await insertRow(TABLES.fc, { notebook_id: nb.id, front: front.value.trim(), back: back.value.trim(), box: 1, next_review: today() });
      if (row) { S.cardDraft = null; renderMain(); renderList(); showToast("Kart eklendi."); }
    });
    wrap.append(form);

    const all = cardsOf(nb.id);
    if (all.length) {
      const list = h("ul", { class: "sr-card-list" });
      for (const c of all) {
        list.append(h("li", {},
          h("div", {}, h("b", { text: c.front }), h("small", { class: "sr-muted", text: c.back })),
          h("span", { class: "sr-box", text: "Kutu " + c.box + " · " + c.next_review }),
          h("button", { type: "button", class: "text-btn sr-danger", onclick: async () => { if (await removeRow(TABLES.fc, c.id)) { renderMain(); renderList(); } } }, "Sil")));
      }
      wrap.append(list);
    }
    return wrap;
  }

  function startReview(ids) { S.rev = { ids, i: 0, shown: false, known: 0 }; renderMain(); }

  function reviewView() {
    const r = S.rev;
    const box = h("div", { class: "sr-review" });
    if (r.i >= r.ids.length) {
      box.append(h("h3", { text: "Tekrar bitti." }), h("p", { text: r.known + " / " + r.ids.length + " kartı bildin. Bilemediklerin yarın tekrar gelecek." }),
        h("button", { type: "button", class: "primary-btn", onclick: () => { S.rev = null; renderMain(); renderList(); } }, "Kartlara dön"));
      return box;
    }
    const c = S.t.study_flashcards.find((x) => x.id === r.ids[r.i]);
    if (!c) { r.i++; return reviewView(); }
    box.append(
      h("small", { class: "sr-muted", text: "Kart " + (r.i + 1) + " / " + r.ids.length }),
      h("div", { class: "sr-flash" }, h("p", { class: "sr-front", text: c.front }), r.shown ? h("p", { class: "sr-back", text: c.back }) : null));
    if (!r.shown) {
      box.append(h("button", { type: "button", class: "primary-btn", onclick: () => { r.shown = true; renderMain(); } }, "Cevabı göster"));
    } else {
      box.append(h("div", { class: "sr-rate" },
        h("button", { type: "button", class: "secondary-btn", onclick: () => rate(c, false) }, "Bilemedim"),
        h("button", { type: "button", class: "primary-btn", onclick: () => rate(c, true) }, "Bildim")));
    }
    return box;
  }

  async function rate(card, knew) {
    const box = knew ? Math.min(5, card.box + 1) : 1;
    await updateRow(TABLES.fc, card.id, { box, next_review: addDays(BOX_DAYS[box]) });
    if (knew) S.rev.known++;
    S.rev.i++; S.rev.shown = false;
    renderMain();
  }

  /* ----- Defter işlemleri ----- */
  async function createNotebook(e) {
    e.preventDefault();
    const t = $r("srNewTitle"), c = $r("srNewCourse");
    const title = t.value.trim();
    if (!title) { showToast("Defter için bir başlık yaz."); return; }
    const row = await insertRow(TABLES.nb, { title: title.slice(0, 120), course: c.value.trim() || null, body: "" });
    if (!row) return;
    t.value = ""; c.value = "";
    S.activeId = row.id; S.view = "write"; S.sel = null; S.focusHl = null;
    renderAll();
    $r("srBody")?.focus();
  }
  async function renameNotebook() {
    const nb = active();
    const name = window.prompt("Defterin yeni adı:", nb.title);
    if (name && name.trim() && await updateRow(TABLES.nb, nb.id, { title: name.trim().slice(0, 120) })) renderAll();
  }
  async function deleteNotebook() {
    const nb = active();
    if (!window.confirm("“" + nb.title + "” defteri, işaretleri ve kartlarıyla birlikte silinsin mi? Bu geri alınamaz.")) return;
    const id = nb.id;
    if (await removeRow(TABLES.nb, id)) {
      S.t.study_highlights = S.t.study_highlights.filter((x) => x.notebook_id !== id);
      S.t.study_flashcards = S.t.study_flashcards.filter((x) => x.notebook_id !== id);
      writeLocal();
      S.activeId = null;
      renderAll();
    }
  }

  /* ---------- Başlatma ---------- */
  let bound = false;
  let loading = null;
  function ensureLoaded() {
    if (!loading) loading = loadAll().finally(() => { loading = null; });
    return loading;
  }
  async function open() {
    if (!bound) {
      bound = true;
      $r("srNewForm")?.addEventListener("submit", createNotebook);
      $r("srSearch")?.addEventListener("input", (e) => { S.search = e.target.value; renderList(); });
      document.addEventListener("selectionchange", () => { clearTimeout(captureSelection.t); captureSelection.t = setTimeout(captureSelection, 120); });
      db.auth.onAuthStateChange((_event, session) => {
        const uid = session?.user?.id || null;
        if (uid === S.uid && S.loaded) return;
        setTimeout(() => { S.loaded = false; S.activeId = null; if (location.hash.startsWith("#/defter")) open(); }, 0);
      });
    }
    if (!S.loaded) await ensureLoaded();
    renderAll();
  }

  window.StudyRoom = { open };
  // Sayfa doğrudan #/defter adresiyle açılırsa app.js bu dosyadan önce çalıştığı için burada başlatılır.
  if (location.hash.startsWith("#/defter")) open();
})();
