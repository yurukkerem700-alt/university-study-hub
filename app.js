const SUPABASE_URL = "https://snvteuqzstctmqlsgyhr.supabase.co";
const SUPABASE_KEY = "sb_publishable_0oJW2Ui715WZdqQmVp23TPw_vU4E93ZK";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  q: "",
  tab: "all",
  department: "all",
  year: "all",
  topic: "all",
  type: "all",
  authority: "all",
  sort: "popular",
};

const cache = {
  resources: [],
  notes: [],
  events: [],
};

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));

const compact = (value) =>
  new Intl.NumberFormat("tr-TR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value || 0);

function showToast(message) {
  const element = $("#toast");
  if (!element) return;
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => element.classList.remove("show"), 2200);
}

function openModal(selector) {
  $(selector)?.classList.remove("hidden");
}

function closeModals() {
  $$(".modal").forEach((modal) => modal.classList.add("hidden"));
}

async function getSession() {
  return (await db.auth.getSession()).data.session;
}

async function refreshAuthUi() {
  const session = await getSession();
  $("#authBtn").textContent = session ? "Çıkış Yap" : "Giriş Yap";
}

function resourceCard(resource) {
  const isOfficial = resource.authority === "official";
  return `
    <article class="result-card">
      <div class="result-top">
        <span class="source-badge ${isOfficial ? "official" : ""}">
          ${isOfficial ? "RESMÎ KAYNAK" : "DOĞRULANMIŞ DIŞ"}
        </span>
        <span class="result-kind">${escapeHtml(resource.category)}</span>
      </div>
      <h3>${escapeHtml(resource.title)}</h3>
      <p>${escapeHtml(resource.summary)}</p>
      <div class="source-line">
        <span>Kaynak:</span>
        <b>${escapeHtml(resource.source_name)}</b>
        <span>·</span>
        <span>${escapeHtml(resource.verified_at)} doğrulandı</span>
      </div>
      <div class="result-foot">
        <small>${escapeHtml((resource.tags || []).slice(0, 3).join(" · "))}</small>
        <div class="result-actions">
          <button class="secondary-btn" data-open-resource="${resource.id}">Kaynağı aç ↗</button>
        </div>
      </div>
    </article>
  `;
}

function noteCard(note) {
  return `
    <article class="result-card">
      <div class="result-top">
        <span class="source-badge community">ÖĞRENCİ KAYNAĞI</span>
        <span class="result-kind">${escapeHtml(note.content_type)}</span>
      </div>
      <h3>${escapeHtml(note.title)}</h3>
      <p>${escapeHtml(note.description || "Topluluk tarafından paylaşılan ders kaynağı.")}</p>
      <div class="source-line">
        <span>${escapeHtml(note.department)}</span>
        <span>·</span>
        <span>${note.study_year || "-"}. sınıf</span>
        <span>·</span>
        <span>⭐ ${Number(note.rating || 0).toFixed(1)}</span>
      </div>
      <div class="result-foot">
        <small>⬇ ${compact(note.downloads)} · ♥ ${compact(note.likes_count)}</small>
        <div class="result-actions">
          <button class="ghost-btn" data-note-preview="${note.id}">Önizle</button>
          <button class="ghost-btn" data-note-like="${note.id}">♥</button>
          <button class="ghost-btn" data-note-save="${note.id}">☆</button>
          <button class="ghost-btn" data-note-rate="${note.id}">Puanla</button>
          <button class="secondary-btn" data-note-download="${note.id}">İndir</button>
        </div>
      </div>
    </article>
  `;
}

function eventCard(event) {
  const date = new Date(event.event_date);
  return `
    <article class="event">
      <div class="event-date">
        ${date.toLocaleDateString("tr-TR", { day: "2-digit" })}
        <small>${date.toLocaleDateString("tr-TR", { month: "short" })}</small>
      </div>
      <div class="event-main">
        <b>${escapeHtml(event.title)}</b>
        <small>
          ${escapeHtml(event.organizer)} · ${escapeHtml(event.category)}
          ${event.deadline_date ? " · Son tarih " + new Date(event.deadline_date).toLocaleDateString("tr-TR") : ""}
        </small>
      </div>
      <a href="${escapeHtml(event.source_url)}" target="_blank" rel="noopener">Kaynağa git ↗</a>
    </article>
  `;
}

async function fetchResources() {
  let query = db.from("knowledge_resources").select("*");

  if (state.authority !== "all") {
    query = query.eq("authority", state.authority);
  }

  if (state.q) {
    const term = state.q.replace(/[%_]/g, " ").trim();
    query = query.or(
      `title.ilike.%${term}%,summary.ilike.%${term}%,source_name.ilike.%${term}%,category.ilike.%${term}%`
    );
  }

  query =
    state.sort === "newest"
      ? query.order("verified_at", { ascending: false })
      : query.order("featured", { ascending: false }).order("verified_at", { ascending: false });

  const { data, error } = await query.limit(60);
  if (error) throw error;
  return data || [];
}

async function fetchNotes() {
  let query = db.from("notes").select("*").eq("status", "published");

  if (state.department !== "all") query = query.eq("department", state.department);
  if (state.year !== "all") query = query.eq("study_year", Number(state.year));
  if (state.topic !== "all") query = query.eq("topic", state.topic);
  if (state.type !== "all") query = query.eq("content_type", state.type);

  if (state.q) {
    const term = state.q.replace(/[%_]/g, " ").trim();
    query = query.or(
      `title.ilike.%${term}%,description.ilike.%${term}%,topic.ilike.%${term}%,lecturer.ilike.%${term}%,university.ilike.%${term}%`
    );
  }

  query =
    state.sort === "newest"
      ? query.order("created_at", { ascending: false })
      : state.sort === "rating"
        ? query.order("rating", { ascending: false })
        : query.order("downloads", { ascending: false });

  const { data, error } = await query.limit(60);
  if (error) throw error;
  return data || [];
}

async function fetchEvents() {
  const { data, error } = await db
    .from("academic_events")
    .select("*")
    .order("event_date", { ascending: true })
    .limit(16);

  if (error) throw error;
  return data || [];
}

async function loadAll() {
  $("#resultsLoading").style.display = "block";

  try {
    const [resources, notes, events] = await Promise.all([
      fetchResources(),
      fetchNotes(),
      fetchEvents(),
    ]);

    cache.resources = resources;
    cache.notes = notes;
    cache.events = events;

    renderResults();
    renderEvents();
    updateStats();

    $("#resultsLoading").style.display = "none";
    $("#lastSync").textContent =
      "Son veri kontrolü: " +
      new Date().toLocaleString("tr-TR", {
        dateStyle: "short",
        timeStyle: "short",
      });
  } catch (error) {
    console.error(error);
    $("#resultsLoading").style.display = "none";
    $("#resultsGrid").innerHTML =
      '<div class="loading" style="grid-column:1/-1">Kaynaklar yüklenemedi. Bağlantını kontrol edip tekrar dene.</div>';
    showToast("Veri yüklenirken bir hata oluştu.");
  }
}

function renderResults() {
  let markup = "";

  if (state.tab === "all" || state.tab === "resource") {
    markup += cache.resources.map(resourceCard).join("");
  }

  if (state.tab === "all" || state.tab === "note") {
    markup += cache.notes.map(noteCard).join("");
  }

  if (state.tab === "event") {
    markup += cache.events.map(eventCard).join("");
  }

  if (!markup) {
    markup =
      '<div class="loading" style="grid-column:1/-1">Bu arama ve filtrelerle eşleşen kaynak bulunamadı.</div>';
  }

  $("#resultsGrid").innerHTML = markup;

  const titles = {
    all: "Öne çıkan kaynaklar",
    resource: "Güvenilir kaynaklar",
    note: "Öğrenci notları",
    event: "Yaklaşanlar",
  };

  $("#resultTitle").textContent =
    state.q ? `"${state.q}" için sonuçlar` : titles[state.tab];
  $("#resultEyebrow").textContent =
    state.tab === "event"
      ? `${cache.events.length} kayıt`
      : `${cache.resources.length + cache.notes.length} sonuç`;
}

function updateStats() {
  $("#statResources").textContent = compact(cache.resources.length);
  $("#statNotes").textContent = compact(cache.notes.length);
  $("#statEvents").textContent = compact(cache.events.length);

  $("#officialCount").textContent =
    cache.resources.filter((item) => item.authority === "official").length;
  $("#externalCount").textContent =
    cache.resources.filter((item) => item.authority === "verified_external").length;
  $("#communityCount").textContent = cache.notes.length;
}

function renderEvents() {
  $("#eventsList").innerHTML = cache.events.length
    ? cache.events.slice(0, 8).map(eventCard).join("")
    : '<div class="loading">Yaklaşan kayıt bulunamadı.</div>';
}


async function fetchRoadmap(domain, year) {
  const { data, error } = await db
    .from("study_catalog")
    .select("*")
    .eq("domain", domain)
    .eq("year_level", year)
    .order("semester", { ascending: true })
    .order("subject", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function renderRoadmap() {
  const grid = $("#roadmapGrid");
  if (!grid) return;

  grid.innerHTML = '<div class="loading" style="grid-column:1/-1">Ders haritası yükleniyor…</div>';

  try {
    const domain = $("#roadmapDomain").value;
    const year = Number(document.querySelector(".year-tab.active")?.dataset.year || 1);
    const items = await fetchRoadmap(domain, year);

    if (!items.length) {
      grid.innerHTML = '<div class="loading" style="grid-column:1/-1">Bu alan ve sınıf için henüz yol haritası yok.</div>';
      return;
    }

    const grouped = new Map();

    items.forEach((item) => {
      if (!grouped.has(item.subject)) {
        grouped.set(item.subject, {
          subject: item.subject,
          semester: item.semester,
          topics: [],
          skills: new Set(),
        });
      }

      const subject = grouped.get(item.subject);
      subject.topics.push(item);
      if (item.skill) subject.skills.add(item.skill);
    });

    grid.innerHTML = [...grouped.values()]
      .map(
        (subject) => `
          <article class="roadmap-card">
            <span class="semester">${subject.semester}. dönem</span>
            <div class="subject">${escapeHtml(subject.subject)}</div>
            ${subject.topics
              .map(
                (topic) => `
                  <div class="roadmap-topic">
                    <b>${escapeHtml(topic.topic)}</b>
                    <span>${escapeHtml(topic.level)} · ${escapeHtml(topic.roadmap_type === "genel" ? "genel akademik" : "alan")}</span>
                  </div>
                `
              )
              .join("")}
            <div class="roadmap-skill">Odak: ${escapeHtml([...subject.skills].join(" · "))}</div>
          </article>
        `
      )
      .join("");
  } catch (error) {
    console.error(error);
    grid.innerHTML = '<div class="loading" style="grid-column:1/-1">Ders haritası yüklenemedi.</div>';
  }
}

async function requireUser() {
  const session = await getSession();
  if (session) return session.user;

  openModal("#authModal");
  showToast("Bu işlem için giriş yapmalısın.");
  return null;
}

async function submitAuth(event) {
  event.preventDefault();

  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  const displayName = $("#authName").value.trim();
  const signup = !$("#authNameWrap").classList.contains("hidden");

  const response = signup
    ? await db.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName || "Öğrenci" },
        },
      })
    : await db.auth.signInWithPassword({ email, password });

  if (response.error) {
    showToast(response.error.message);
    return;
  }

  closeModals();
  showToast(signup ? "Kayıt başarılı. E-postanı doğrulaman gerekebilir." : "Giriş başarılı.");
  await refreshAuthUi();
}

async function shareNote(event) {
  event.preventDefault();

  const user = await requireUser();
  if (!user) return;

  const form = new FormData(event.currentTarget);
  const file = form.get("file");

  if (!(file instanceof File) || !file.size) {
    showToast("Bir dosya seçmelisin.");
    return;
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;

  const upload = await db.storage.from("note-files").upload(path, file);
  if (upload.error) {
    showToast("Dosya yüklenemedi.");
    return;
  }

  const insert = await db.from("notes").insert({
    title: form.get("title"),
    department: form.get("department"),
    study_year: Number(form.get("study_year")),
    topic: form.get("topic") || null,
    content_type: form.get("content_type"),
    university: form.get("university") || null,
    description: form.get("description") || null,
    file_path: path,
    file_name: file.name,
    file_size: file.size,
    uploader_id: user.id,
    status: "published",
  });

  if (insert.error) {
    await db.storage.from("note-files").remove([path]);
    showToast("Not kaydedilemedi.");
    return;
  }

  closeModals();
  event.currentTarget.reset();
  showToast("Kaynak yayınlandı.");
  await loadAll();
  renderRoadmap();
}

async function downloadNote(id) {
  const note = cache.notes.find((item) => item.id === id);

  if (!note?.file_path) {
    showToast("Bu kaynağın dosyası henüz yok.");
    return;
  }

  const download = await db.storage.from("note-files").download(note.file_path);
  if (download.error) {
    showToast("İndirme başarısız.");
    return;
  }

  const url = URL.createObjectURL(download.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = note.file_name || "not";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  let token = localStorage.getItem("notora_download_token");
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem("notora_download_token", token);
  }

  const session = await getSession();
  const eventKey = `${token}-${id}`;

  await db.from("note_download_events").upsert(
    {
      note_id: id,
      user_id: session?.user?.id || null,
      client_token: eventKey,
    },
    { onConflict: "note_id,client_token", ignoreDuplicates: true }
  );

  note.downloads = (note.downloads || 0) + 1;
  updateStats();
  showToast("İndirme başlatıldı.");
}

async function toggleLike(id) {
  const user = await requireUser();
  if (!user) return;

  const { data: existing } = await db
    .from("note_likes")
    .select("note_id")
    .eq("note_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    await db.from("note_likes").delete().eq("note_id", id).eq("user_id", user.id);
    showToast("Beğeni kaldırıldı.");
  } else {
    await db.from("note_likes").insert({ note_id: id, user_id: user.id });
    showToast("Notu beğendin.");
  }

  await loadAll();
}

async function toggleSave(id) {
  const user = await requireUser();
  if (!user) return;

  const { data: existing } = await db
    .from("bookmarks")
    .select("note_id")
    .eq("note_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    await db.from("bookmarks").delete().eq("note_id", id).eq("user_id", user.id);
    showToast("Kaydedilenlerden çıkarıldı.");
  } else {
    await db.from("bookmarks").insert({ note_id: id, user_id: user.id });
    showToast("Not kaydedildi.");
  }
}

async function rateNote(id) {
  const user = await requireUser();
  if (!user) return;

  const value = Number(window.prompt("1–5 arasında puan ver:", "5"));

  if (!Number.isInteger(value) || value < 1 || value > 5) {
    showToast("Puan 1 ile 5 arasında olmalı.");
    return;
  }

  const response = await db.from("note_ratings").upsert(
    {
      note_id: id,
      user_id: user.id,
      rating: value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "note_id,user_id" }
  );

  if (response.error) {
    showToast("Puan kaydedilemedi.");
    return;
  }

  showToast("Puanın kaydedildi.");
  await loadAll();
}

function addCourseRow() {
  const id = crypto.randomUUID();

  $("#gpaRows").insertAdjacentHTML(
    "beforeend",
    `
      <div class="gpa-row" data-id="${id}">
        <input placeholder="Ders" aria-label="Ders adı">
        <input type="number" min="1" max="10" value="3" step="1" aria-label="Kredi">
        <select aria-label="Not">
          <option value="4">AA</option>
          <option value="3.5">BA</option>
          <option value="3">BB</option>
          <option value="2.5">CB</option>
          <option value="2">CC</option>
          <option value="1.5">DC</option>
          <option value="1">DD</option>
          <option value="0">FF</option>
        </select>
        <button class="remove" type="button" aria-label="Dersi sil">×</button>
      </div>
    `
  );

  calculateGpa();
}

function calculateGpa() {
  let totalPoints = 0;
  let totalCredits = 0;

  $$(".gpa-row").forEach((row) => {
    const credit = Number(row.querySelector('input[type="number"]')?.value || 0);
    const grade = Number(row.querySelector("select")?.value || 0);
    totalPoints += credit * grade;
    totalCredits += credit;
  });

  $("#gpaResult").textContent = totalCredits
    ? `${(totalPoints / totalCredits).toFixed(2)} / 4.00`
    : "—";
}

let timerSeconds = 25 * 60;
let timerRunning = false;
let timerId = null;

function renderTimer() {
  $("#timer").textContent =
    String(Math.floor(timerSeconds / 60)).padStart(2, "0") +
    ":" +
    String(timerSeconds % 60).padStart(2, "0");
}

function toggleTimer() {
  timerRunning = !timerRunning;
  $("#startTimer").textContent = timerRunning ? "Duraklat" : "Başlat";

  if (timerRunning) {
    timerId = window.setInterval(() => {
      timerSeconds = Math.max(timerSeconds - 1, 0);
      renderTimer();

      if (timerSeconds === 0) {
        clearInterval(timerId);
        timerRunning = false;
        $("#startTimer").textContent = "Başlat";
        showToast("25 dakikalık odak tamamlandı.");
      }
    }, 1000);
  } else {
    clearInterval(timerId);
  }
}

function resetTimer() {
  clearInterval(timerId);
  timerRunning = false;
  timerSeconds = 25 * 60;
  $("#startTimer").textContent = "Başlat";
  renderTimer();
}

const taskStorageKey = "notora_tasks";

function readTasks() {
  try {
    return JSON.parse(localStorage.getItem(taskStorageKey) || "[]");
  } catch {
    return [];
  }
}

function writeTasks(tasks) {
  localStorage.setItem(taskStorageKey, JSON.stringify(tasks));
}

function renderTasks() {
  const tasks = readTasks();

  $("#tasks").innerHTML = tasks
    .map(
      (task) => `
        <div class="task ${task.done ? "done" : ""}" data-id="${task.id}">
          <span>✓</span>
          <span>${escapeHtml(task.text)}</span>
          <button type="button" data-remove-task="${task.id}" aria-label="Görevi sil">×</button>
        </div>
      `
    )
    .join("");
}

function addTask(event) {
  event.preventDefault();

  const input = $("#taskInput");
  const text = input.value.trim();
  if (!text) return;

  const tasks = readTasks();
  if (tasks.length >= 5) {
    showToast("En fazla 5 aktif görev tutabilirsin.");
    return;
  }

  tasks.push({
    id: crypto.randomUUID(),
    text,
    done: false,
  });

  writeTasks(tasks);
  input.value = "";
  renderTasks();
}

function toggleTask(id) {
  writeTasks(
    readTasks().map((task) =>
      task.id === id ? { ...task, done: !task.done } : task
    )
  );
  renderTasks();
}

function removeTask(id) {
  writeTasks(readTasks().filter((task) => task.id !== id));
  renderTasks();
}

function bindEvents() {
  [
    ["department", "departmentSelect"],
    ["year", "yearSelect"],
    ["topic", "topicSelect"],
    ["type", "typeSelect"],
    ["authority", "authoritySelect"],
  ].forEach(([key, id]) => {
    $("#" + id).addEventListener("change", (event) => {
      state[key] = event.target.value;
      loadAll();
    });
  });

  $("#sortSelect").addEventListener("change", (event) => {
    state.sort = event.target.value;
    loadAll();
  });

  $("#searchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.q = $("#searchInput").value.trim();
    loadAll();
  });

  $$(".hint").forEach((button) => {
    button.addEventListener("click", () => {
      $("#searchInput").value = button.dataset.query;
      state.q = button.dataset.query;
      loadAll();
    });
  });

  $$(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".tab").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.tab = button.dataset.tab;
      loadAll();
    });
  });

  $("#roadmapDomain")?.addEventListener("change", renderRoadmap);
  $(".year-tab").forEach((button) => {
    button.addEventListener("click", () => {
      $(".year-tab").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderRoadmap();
    });
  });

  $("#resetFilters").addEventListener("click", () => {
    Object.assign(state, {
      q: "",
      department: "all",
      year: "all",
      topic: "all",
      type: "all",
      authority: "all",
      sort: "popular",
    });

    $("#searchInput").value = "";
    ["departmentSelect", "yearSelect", "topicSelect", "typeSelect", "authoritySelect", "sortSelect"]
      .forEach((id) => ($("#" + id).value = id === "sortSelect" ? "popular" : "all"));

    loadAll();
    showToast("Filtreler temizlendi.");
  });

  $("#resultsGrid").addEventListener("click", (event) => {
    const resourceButton = event.target.closest("[data-open-resource]");
    const previewButton = event.target.closest("[data-note-preview]");
    const downloadButton = event.target.closest("[data-note-download]");
    const likeButton = event.target.closest("[data-note-like]");
    const saveButton = event.target.closest("[data-note-save]");
    const rateButton = event.target.closest("[data-note-rate]");

    if (resourceButton) {
      const resource = cache.resources.find(
        (item) => item.id === Number(resourceButton.dataset.openResource)
      );
      if (resource) window.open(resource.source_url, "_blank", "noopener");
    }

    if (previewButton) {
      const note = cache.notes.find(
        (item) => item.id === Number(previewButton.dataset.notePreview)
      );
      if (note?.file_path) {
        window.open(
          SUPABASE_URL + "/storage/v1/object/public/note-files/" + note.file_path,
          "_blank",
          "noopener"
        );
      } else {
        showToast("Bu notta henüz dosya yok.");
      }
    }

    if (downloadButton) downloadNote(Number(downloadButton.dataset.noteDownload));
    if (likeButton) toggleLike(Number(likeButton.dataset.noteLike));
    if (saveButton) toggleSave(Number(saveButton.dataset.noteSave));
    if (rateButton) rateNote(Number(rateButton.dataset.noteRate));
  });

  ["#shareBtn", "#shareBtn2"].forEach((selector) => {
    $(selector).addEventListener("click", async () => {
      if (await requireUser()) openModal("#shareModal");
    });
  });

  $("#authBtn").addEventListener("click", async () => {
    if (await getSession()) {
      await db.auth.signOut();
      showToast("Çıkış yapıldı.");
      refreshAuthUi();
      return;
    }

    openModal("#authModal");
  });

  $$(".modal [data-close]").forEach((button) => {
    button.addEventListener("click", closeModals);
  });

  $("#authSwitch").addEventListener("click", () => {
    const isLogin = $("#authNameWrap").classList.contains("hidden");
    $("#authNameWrap").classList.toggle("hidden", !isLogin);
    $("#authTitle").textContent = isLogin ? "Hesap oluştur" : "Giriş yap";
    $("#authSubmit").textContent = isLogin ? "Kayıt Ol" : "Giriş Yap";
    $("#authSwitch").textContent = isLogin
      ? "Zaten hesabın var mı? Giriş yap"
      : "Hesabın yok mu? Kayıt ol";
  });

  $("#authForm").addEventListener("submit", submitAuth);
  $("#shareForm").addEventListener("submit", shareNote);

  $("#reportBtn").addEventListener("click", () => {
    showToast("Kaynak raporlama modülü yönetim paneline bağlanacak.");
  });

  $("#addCourse").addEventListener("click", addCourseRow);
  $("#gpaRows").addEventListener("input", calculateGpa);
  $("#gpaRows").addEventListener("change", calculateGpa);
  $("#gpaRows").addEventListener("click", (event) => {
    if (event.target.matches(".remove")) {
      event.target.closest(".gpa-row")?.remove();
      calculateGpa();
    }
  });

  $("#startTimer").addEventListener("click", toggleTimer);
  $("#resetTimer").addEventListener("click", resetTimer);
  $("#taskForm").addEventListener("submit", addTask);

  $("#tasks").addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-task]");
    if (removeButton) {
      removeTask(removeButton.dataset.removeTask);
      return;
    }

    const task = event.target.closest(".task");
    if (task) toggleTask(task.dataset.id);
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "/" &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
    ) {
      event.preventDefault();
      $("#searchInput").focus();
    }

    if (event.key === "Escape") closeModals();
  });

  db.auth.onAuthStateChange(() => refreshAuthUi());
}

addCourseRow();
renderTasks();
renderTimer();
bindEvents();
refreshAuthUi();
loadAll();
renderRoadmap();
