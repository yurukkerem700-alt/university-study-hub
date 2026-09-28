const SUPABASE_URL = "https://snvteuqzstctmqlsgyhr.supabase.co";
// Supabase browser key: legacy anon key is currently the compatible public Data API/Auth key for this project.
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNudnRldXF6c3RjdG1xbHNneWhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNjk1ODAsImV4cCI6MjEwNTY0NTU4MH0.cd6s5mWpaepkE2vlZWiEeMJLU_n3vQx6YBnHJRD2boI";
const APP_VERSION = "6";
const CATALOG_SOURCE_YEAR = 2025;

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
let authSubscription = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const normalizeSearchTerm = (value) =>
  String(value ?? "")
    .replace(/[,%_()*+]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

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
  catalog: [],
  universities: [],
  programs: [],
  catalogOffers: [],
};

const catalogState = { q: "", kind: "programs", level: "all", city: "all", page: 1, pageSize: 48 };
let catalogLoaded = false;
const catalogMeta = { offers: 0, universities: 0, programs: 0, levels: { "Lisans": 0, "Ön Lisans": 0 } };
const LOCAL_CACHE_PREFIX = "notora_live_cache_v1_";

function readLocalCache(key, fallback = []) {
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_CACHE_PREFIX + key) || "null");
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalCache(key, value) {
  try {
    localStorage.setItem(
      LOCAL_CACHE_PREFIX + key,
      JSON.stringify(Array.isArray(value) ? value : [])
    );
  } catch {
    // Storage quotas or privacy settings should never block the app.
  }
}

function hydrateLiveCache() {
  cache.resources = readLocalCache("resources", cache.resources);
  cache.notes = readLocalCache("notes", cache.notes);
  cache.events = readLocalCache("events", cache.events);
}

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

function setAuthMessage(message = "", type = "") {
  const box = $("#authMessage");
  if (!box) return;
  box.textContent = message;
  box.className = "auth-message" + (type ? " " + type : "");
}

function setAuthMode(mode = "login") {
  const signup = mode === "signup";
  $("#authNameWrap")?.classList.toggle("hidden", !signup);
  $("#authTitle").textContent = signup ? "Hesap oluştur" : "Giriş yap";
  $("#authSubmit").textContent = signup ? "Hesap oluştur" : "Giriş yap";
  $("#authSwitch").textContent = signup ? "Zaten hesabın var mı? Giriş yap" : "Hesabın yok mu? Kayıt ol";
  $("#authPassword")?.setAttribute("autocomplete", signup ? "new-password" : "current-password");
  setAuthMessage("");
}

function authErrorMessage(error) {
  const message = String(error?.message || "Beklenmeyen bir hata oluştu.");
  if (/invalid login credentials/i.test(message)) return "E-posta veya şifre hatalı.";
  if (/email not confirmed/i.test(message)) return "E-posta adresini doğruladıktan sonra giriş yapabilirsin.";
  if (/user already registered/i.test(message)) return "Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene.";
  if (/password.*(6|characters|length)/i.test(message)) return "Şifre en az 6 karakter olmalı.";
  if (/rate limit|too many requests/i.test(message)) return "Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin.";
  if (error?.code === "42501" || /permission denied|insufficient privilege/i.test(message)) {
    return "Veri erişim yetkisi eksik. Supabase Data API izinlerini kontrol et.";
  }
  if (/invalid api key/i.test(message)) return "Supabase bağlantı anahtarı geçersiz. Sayfayı yenileyip tekrar dene.";
  return message;
}



async function syncProfile(user, displayName = "") {
  if (!user?.id) return;
  const name = displayName.trim() || user.user_metadata?.display_name || "Öğrenci";
  const { error } = await db.from("profiles").upsert(
    { id: user.id, display_name: name, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
  if (error) console.warn("Profil senkronizasyonu başarısız:", error);
}

async function refreshAuthUi(sessionOverride = undefined) {
  const session = sessionOverride === undefined ? await getSession() : sessionOverride;
  const button = $("#authBtn");
  if (!button) return;
  button.textContent = session ? "Hesabım" : "Giriş Yap";
  button.title = session ? session.user.email + " · Hesap açık" : "Giriş yap";
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
        <span>${Number(note.rating || 0).toFixed(1)}</span>
      </div>
      <div class="result-foot">
        <small>${compact(note.downloads)} · · ${compact(note.likes_count)}</small>
        <div class="result-actions">
          <button class="ghost-btn" data-note-preview="${note.id}">Önizle</button>
          <button class="ghost-btn" data-note-like="${note.id}"></button>
          <button class="ghost-btn" data-note-save="${note.id}">Kaydet</button>
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
    const term = normalizeSearchTerm(state.q);
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
    const term = normalizeSearchTerm(state.q);
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


async function fetchCatalogMatches() {
  if (!state.q) return [];

  const term = normalizeSearchTerm(state.q);
  if (!term) return [];

  const { data, error } = await db
    .from("study_catalog")
    .select("*")
    .or(
      `subject.ilike.%${term}%,topic.ilike.%${term}%,skill.ilike.%${term}%,domain.ilike.%${term}%`
    )
    .order("year_level", { ascending: true })
    .limit(10);

  if (error) throw error;
  return data || [];
}

function catalogCard(item) {
  return `
    <article class="result-card catalog-result">
      <div class="result-top">
        <span class="source-badge official">DERS HARİTASI</span>
        <span class="result-kind">${escapeHtml(item.domain)} · ${item.year_level}. sınıf</span>
      </div>
      <h3>${escapeHtml(item.subject)} — ${escapeHtml(item.topic)}</h3>
      <p>${escapeHtml(item.skill || "Konunun temel kavramlarını ve uygulamasını çalış.")}</p>
      <div class="source-line">
        <span>${item.semester}. dönem</span><span>·</span><span>${escapeHtml(item.level)}</span>
      </div>
      <div class="result-foot">
        <small>Genel akademik yol haritası</small>
        <div class="result-actions">
          <button class="secondary-btn" data-open-roadmap data-domain="${escapeHtml(item.domain)}" data-year="${item.year_level}">Haritayı aç</button>
        </div>
      </div>
    </article>
  `;
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

  hydrateLiveCache();

  const results = await Promise.allSettled([
    fetchResources(),
    fetchNotes(),
    fetchEvents(),
    fetchCatalogMatches(),
  ]);

  const [resources, notes, events, catalog] = results;

  if (resources.status === "fulfilled") {
    cache.resources = resources.value;
    writeLocalCache("resources", cache.resources);
  }
  if (notes.status === "fulfilled") {
    cache.notes = notes.value;
    writeLocalCache("notes", cache.notes);
  }
  if (events.status === "fulfilled") {
    cache.events = events.value;
    writeLocalCache("events", cache.events);
  }
  cache.catalog = catalog.status === "fulfilled" ? catalog.value : cache.catalog;

  renderResults();
  renderEvents();
  updateStats();
  $("#resultsLoading").style.display = "none";

  const successful = [resources, notes, events].some((item) => item.status === "fulfilled");
  $("#lastSync").textContent = successful
    ? "Canlı veri kontrolü: " +
      new Date().toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })
    : "Canlı bağlantı bekleniyor · önbellekteki veriler gösteriliyor";

  const failed = results.filter((item) => item.status === "rejected");
  if (failed.length) {
    console.warn("Kısmi Supabase yükleme hatası:", failed.map((item) => item.reason));
    if (!successful) {
      showToast("Canlı bağlantı kurulamadı; daha önce yüklenen veriler gösteriliyor.");
    } else {
      showToast("Bazı canlı kaynaklar yüklenemedi; mevcut veriler korunuyor.");
    }
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

  if (state.q && state.tab === "all") {
    markup += cache.catalog.map(catalogCard).join("");
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


async function loadCatalog() {
  if (catalogLoaded) return;

  try {
    const base = "data/catalog/";
    const [universitiesResponse, programsResponse, offersResponse] = await Promise.all([
      fetch(base + "universities.json", { cache: "no-store" }),
      fetch(base + "programs.json", { cache: "no-store" }),
      fetch(base + "offers.json", { cache: "no-store" }),
    ]);

    if (!universitiesResponse.ok || !programsResponse.ok || !offersResponse.ok) {
      throw new Error("Türkiye katalog dosyaları yüklenemedi.");
    }

    const [universitiesPayload, programsPayload, offersPayload] = await Promise.all([
      universitiesResponse.json(),
      programsResponse.json(),
      offersResponse.json(),
    ]);

    cache.universities = universitiesPayload.items || [];
    cache.programs = programsPayload.items || [];
    cache.catalogOffers = offersPayload.items || [];

    const isTurkey = (item) =>
      String(item?.region || "").toLocaleLowerCase("tr-TR") === "türkiye";
    const turkeyUniversityIndexes = new Set(
      cache.universities
        .map((item, index) => (isTurkey(item) ? index : -1))
        .filter((index) => index >= 0)
    );
    const turkeyOffers = cache.catalogOffers.filter((offer) => turkeyUniversityIndexes.has(offer[0]));
    const turkeyProgramIndexes = new Set(
      turkeyOffers.map((offer) => offer[1]).filter(Number.isInteger)
    );

    catalogMeta.offers = turkeyOffers.length;
    catalogMeta.universities = turkeyUniversityIndexes.size;
    catalogMeta.programs = turkeyProgramIndexes.size;
    catalogLoaded = true;

    const citySelect = $("#catalogCity");
    if (citySelect) {
      const cities = [...new Set(
        cache.universities
          .filter((item) => String(item.region || "").toLocaleLowerCase("tr-TR") === "türkiye")
          .map((item) => item.city)
          .filter(Boolean)
      )].sort((a, b) => a.localeCompare(b, "tr"));
      citySelect.innerHTML =
        '<option value="all">Tüm şehirler</option>' +
        cities.map((city) => '<option value="' + escapeHtml(city) + '">' + escapeHtml(city) + "</option>").join("");
    }

    const departmentList = $("#departmentOptions");
    if (departmentList) {
      const programNames = [...new Set(
        cache.programs
          .map((item, index) => turkeyProgramIndexes.has(index) ? item.name : null)
          .filter(Boolean)
      )].sort((a, b) => a.localeCompare(b, "tr"));
      departmentList.innerHTML = programNames
        .map((name) => '<option value="' + escapeHtml(name) + '"></option>')
        .join("");
    }

    const levelCounts = {};
    for (const programIndex of turkeyProgramIndexes) {
      const item = cache.programs[programIndex];
      if (item?.level) levelCounts[item.level] = (levelCounts[item.level] || 0) + 1;
    }
    catalogMeta.levels = levelCounts;

    $("#catalogUniversityCount") && ($("#catalogUniversityCount").textContent = catalogMeta.universities.toLocaleString("tr-TR"));
    $("#catalogProgramCount") && ($("#catalogProgramCount").textContent = catalogMeta.programs.toLocaleString("tr-TR"));
    $("#catalogOfferCount") && ($("#catalogOfferCount").textContent = catalogMeta.offers.toLocaleString("tr-TR"));
    $("#heroUniversityCount") && ($("#heroUniversityCount").textContent = catalogMeta.universities.toLocaleString("tr-TR"));
    renderCatalog();
  } catch (error) {
    console.error("Katalog yükleme hatası:", error);
    const grid = $("#catalogGrid");
    if (grid) grid.innerHTML = '<div class="loading">Türkiye katalog verisi yüklenemedi.</div>';
  }
}

function renderCatalogPagination(total) {
  const box = $("#catalogPagination");
  const pageInfo = $("#catalogPageInfo");
  if (!box) return;
  const pageCount = Math.max(1, Math.ceil(total / catalogState.pageSize));
  catalogState.page = Math.min(Math.max(1, catalogState.page), pageCount);
  const current = catalogState.page;
  const buttons = [];
  buttons.push('<button type="button" data-catalog-page="' + (current - 1) + '"' + (current <= 1 ? " disabled" : "") + ' aria-label="Önceki sayfa">‹</button>');
  const windowStart = Math.max(1, current - 2);
  const windowEnd = Math.min(pageCount, current + 2);
  if (windowStart > 1) buttons.push('<button type="button" data-catalog-page="1">1</button>');
  if (windowStart > 2) buttons.push('<span class="catalog-page-gap">…</span>');
  for (let page = windowStart; page <= windowEnd; page += 1) {
    buttons.push('<button type="button" data-catalog-page="' + page + '"' + (page === current ? ' class="active"' : '') + '>' + page + '</button>');
  }
  if (windowEnd < pageCount - 1) buttons.push('<span class="catalog-page-gap">…</span>');
  if (windowEnd < pageCount) buttons.push('<button type="button" data-catalog-page="' + pageCount + '">' + pageCount + '</button>');
  buttons.push('<button type="button" data-catalog-page="' + (current + 1) + '"' + (current >= pageCount ? " disabled" : "") + ' aria-label="Sonraki sayfa">›</button>');
  box.innerHTML = total > catalogState.pageSize ? buttons.join("") : "";
  if (pageInfo) pageInfo.textContent = total > catalogState.pageSize ? ("Sayfa " + current + " / " + pageCount) : (total ? "Tüm eşleşmeler gösteriliyor" : "0 sonuç");
}
function catalogLevelOverview() {
  const cards = [
    {key:"highschool",icon:"" "",title:"Lise",text:"Lise dersleri, sınav hazırlığı ve konu kaynakları için ayrı kaynak merkezi. Yükseköğretim kataloğundan bağımsız tutulur.",status:"Kaynak katmanı"},
    {key:"associate",icon:"",title:"Ön Lisans",text:(catalogMeta.levels["Ön Lisans"]||0).toLocaleString("tr-TR")+" program türü; Türkiye program–üniversite kayıtları ayrıca sayfalanır.",status:"Katalogda mevcut"},
    {key:"undergrad",icon:"",title:"Lisans",text:(catalogMeta.levels["Lisans"]||0).toLocaleString("tr-TR")+" program türü; Türkiye program–üniversite kayıtları ayrıca sayfalanır.",status:"Katalogda mevcut"},
    {key:"graduate",icon:"🧪",title:"Yüksek Lisans",text:"Lisansüstü veri, mevcut YÖK 2025 lisans/ön lisans verisine karıştırılmıyor. Ayrı kaynak katmanı için hazır.",status:"Lisansüstü katmanı"},
    {key:"doctorate",icon:"",title:"Doktora",text:"Doktora ve araştırma kaynakları için ayrı katman. Resmî veri olmadan sayı üretilmiyor.",status:"Lisansüstü katmanı"}
  ];
  return '<div class="catalog-level-overview">'+cards.map((card)=>'<article class="catalog-level-overview-card"><span class="catalog-level-icon">'+card.icon+'</span><span class="source-badge official">'+escapeHtml(card.status)+'</span><h3>'+escapeHtml(card.title)+'</h3><p>'+escapeHtml(card.text)+'</p><button class="secondary-btn" type="button" data-education-level="'+card.key+'">Bu düzeyi aç</button></article>').join("")+'</div>';
}
function renderCatalog() {
  const grid=$("#catalogGrid"); if(!grid||!catalogLoaded)return;
  const q=normalizeSearchTerm(catalogState.q).toLocaleLowerCase("tr-TR");
  const isTurkey=(item)=>String(item?.region||"").toLocaleLowerCase("tr-TR")==="türkiye";
  if(catalogState.kind==="levels"){grid.innerHTML=catalogLevelOverview();$("#catalogResultInfo").textContent="5 eğitim düzeyi";renderCatalogPagination(0);return;}
  const paginate=(rows,renderer)=>{const total=rows.length;const pageCount=Math.max(1,Math.ceil(total/catalogState.pageSize));catalogState.page=Math.min(Math.max(1,catalogState.page),pageCount);const begin=(catalogState.page-1)*catalogState.pageSize;grid.innerHTML=rows.slice(begin,begin+catalogState.pageSize).map(renderer).join("")||'<div class="loading" style="grid-column:1/-1">Aramana uygun kayıt bulunamadı.</div>';renderCatalogPagination(total);};
  if(catalogState.kind==="universities"){
    const rows=cache.universities.map((item,index)=>({...item,index})).filter((item)=>{const haystack=[item.name,item.city,item.type].join(" ").toLocaleLowerCase("tr-TR");return isTurkey(item)&&(!q||haystack.includes(q))&&(catalogState.city==="all"||item.city===catalogState.city);});
    paginate(rows,(item)=>{const count=cache.catalogOffers.filter((offer)=>offer[0]===item.index&&isTurkey(item)).length;return '<article class="catalog-card"><div class="catalog-card-top"><span class="catalog-badge">'+escapeHtml(item.type)+'</span><span class="catalog-city">'+escapeHtml(item.city||"—")+'</span></div><h3>'+escapeHtml(item.name)+'</h3><p>'+count.toLocaleString("tr-TR")+' program / tercih kaydı</p><div class="catalog-meta"><span>'+escapeHtml(item.region||"Türkiye")+'</span><span>'+CATALOG_SOURCE_YEAR+' verisi</span></div></article>';});
    $("#catalogResultInfo").textContent=rows.length.toLocaleString("tr-TR")+" Türkiye yükseköğretim kurumu";return;
  }
  if(catalogState.kind==="offers"){
    const rows=cache.catalogOffers.map((offer,index)=>({index,university:cache.universities[offer[0]],program:cache.programs[offer[1]],code:offer[2]||""})).filter(({university,program})=>{if(!isTurkey(university)||!program)return false;const haystack=[university.name,university.city,program.name,program.level,program.score_type].join(" ").toLocaleLowerCase("tr-TR");return(!q||haystack.includes(q))&&(catalogState.city==="all"||university.city===catalogState.city)&&(catalogState.level==="all"||program.level===catalogState.level);});
    paginate(rows,({university,program,code})=>'<article class="catalog-card offer-card"><div class="catalog-card-top"><span class="catalog-badge">'+escapeHtml(program.level||"Program")+'</span><span class="catalog-city">'+escapeHtml(university.city||"—")+'</span></div><h3>'+escapeHtml(program.name)+'</h3><p><strong>'+escapeHtml(university.name)+'</strong><br>'+escapeHtml(program.score_type||"Puan türü yok")+' · '+escapeHtml(program.duration_years||"—")+' yıl</p><div class="catalog-meta"><span>'+escapeHtml(code||"Program kodu yok")+'</span><span>'+CATALOG_SOURCE_YEAR+'</span></div></article>');
    $("#catalogResultInfo").textContent=rows.length.toLocaleString("tr-TR")+" Türkiye program–üniversite kaydı";return;
  }
  const turkeyProgramIndexes=new Set(cache.catalogOffers.filter((offer)=>isTurkey(cache.universities[offer[0]])).map((offer)=>offer[1]));
  const rows=cache.programs.map((item,index)=>({...item,index})).filter((item)=>{const haystack=[item.name,item.level,item.score_type,...(item.faculties||[])].join(" ").toLocaleLowerCase("tr-TR");return turkeyProgramIndexes.has(item.index)&&(!q||haystack.includes(q))&&(catalogState.level==="all"||item.level===catalogState.level);});
  paginate(rows,(item)=>{const count=cache.catalogOffers.filter((offer)=>offer[1]===item.index&&isTurkey(cache.universities[offer[0]])).length;return '<article class="catalog-card"><div class="catalog-card-top"><span class="catalog-badge">'+escapeHtml(item.level)+'</span><span class="catalog-city">'+escapeHtml(item.score_type||"—")+'</span></div><h3>'+escapeHtml(item.name)+'</h3><p>'+count.toLocaleString("tr-TR")+' Türkiye program kaydında yer alıyor · '+escapeHtml(item.duration_years||"—")+' yıl</p><div class="catalog-meta"><span>'+escapeHtml((item.faculties||[]).slice(0,2).join(" · ")||"Fakülte bilgisi yok")+'</span><span>'+CATALOG_SOURCE_YEAR+'</span></div></article>';});
  $("#catalogResultInfo").textContent=rows.length.toLocaleString("tr-TR")+" Türkiye programı";
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

  const email = $("#authEmail").value.trim().toLowerCase();
  const password = $("#authPassword").value;
  const displayName = $("#authName").value.trim();
  const signup = !$("#authNameWrap").classList.contains("hidden");
  const submit = $("#authSubmit");

  setAuthMessage("");
  submit.disabled = true;
  submit.textContent = signup ? "Hesap oluşturuluyor…" : "Giriş yapılıyor…";

  try {
    const response = signup
      ? await db.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName || "Öğrenci" },
            emailRedirectTo: window.location.href.split("#")[0],
          },
        })
      : await db.auth.signInWithPassword({ email, password });

    if (response.error) throw response.error;

    if (signup) {
      if (response.data.session && response.data.user) {
        await syncProfile(response.data.user, displayName);
        closeModals();
        showToast("Hesabın oluşturuldu ve giriş yapıldı.");
      } else {
        setAuthMessage(
          "Kayıt tamamlandı. E-posta adresine gelen doğrulama bağlantısını onayla, ardından giriş yap.",
          "success"
        );
        $("#authPassword").value = "";
        showToast("Doğrulama e-postanı kontrol et.");
      }
    } else {
      await syncProfile(response.data.user);
      closeModals();
      showToast("Giriş başarılı.");
    }

    await refreshAuthUi();
  } catch (error) {
    console.error("Auth hatası:", error);
    setAuthMessage(authErrorMessage(error), "error");
    showToast(authErrorMessage(error));
  } finally {
    submit.disabled = false;
    submit.textContent = signup ? "Hesap oluştur" : "Giriş yap";
  }
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
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}

async function downloadNote(id) {
  const note = cache.notes.find((item) => item.id === id);

  if (!note?.file_path) {
    showToast("Bu kaynağın dosyası henüz yok.");
    return;
  }

  const publicUrl = SUPABASE_URL + "/storage/v1/object/public/note-files/" + note.file_path.split("/").map(encodeURIComponent).join("/");
  const anchor = document.createElement("a");
  anchor.href = publicUrl;
  anchor.target = "_blank";
  anchor.rel = "noopener";
  anchor.download = note.file_name || "not";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

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
        addFocusMinutes(25);
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
  updateTodayDashboard();
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

const preferenceDefaults={education_level:"Lisans",university:"",department:"",study_year:"",goal:"",daily_minutes:60,focus_mode:"pomodoro",theme:"system",notifications:true,preferred_topics:[]};
function readLocalPreferences(){try{const raw=JSON.parse(localStorage.getItem("notora_preferences")||"null");return{...preferenceDefaults,...(raw||{})};}catch{return{...preferenceDefaults};}}
function writeLocalPreferences(prefs){try{localStorage.setItem("notora_preferences",JSON.stringify(prefs));}catch{}}
function applyTheme(theme){
  const mode = theme === "dark" || (theme !== "light" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  document.body.dataset.theme = mode;
}
function preferencesFromForm(){return{education_level:$("#prefEducationLevel")?.value||"Lisans",university:$("#prefUniversity")?.value.trim()||"",department:$("#prefDepartment")?.value.trim()||"",study_year:$("#prefYear")?.value||"",goal:$("#prefGoal")?.value.trim()||"",daily_minutes:Number($("#prefDailyMinutes")?.value||60),focus_mode:$("#prefFocusMode")?.value||"pomodoro",theme:$("#prefTheme")?.value||"system",notifications:true,preferred_topics:($("#prefTopics")?.value||"").split(",").map((x)=>x.trim()).filter(Boolean).slice(0,12)};}
function renderPreferences(prefs=readLocalPreferences()){const map=[["prefEducationLevel","education_level"],["prefUniversity","university"],["prefDepartment","department"],["prefYear","study_year"],["prefGoal","goal"],["prefDailyMinutes","daily_minutes"],["prefFocusMode","focus_mode"],["prefTheme","theme"]];for(const[id,key]of map){const el=$("#"+id);if(el&&prefs[key]!==undefined&&prefs[key]!==null)el.value=String(prefs[key]);}if($("#prefTopics"))$("#prefTopics").value=(prefs.preferred_topics||[]).join(", ");applyTheme(prefs.theme);updatePersonalWelcome(prefs);renderPreferenceChips(prefs);}
function updatePersonalWelcome(prefs){const welcome=$("#personalWelcome");if(!welcome)return;const title=prefs.department||prefs.goal||prefs.university?"Çalışma alanın hazır":"Hoş geldin";const detail=[prefs.department,prefs.study_year?prefs.study_year+". sınıf":"",prefs.goal].filter(Boolean).join(" · ");welcome.querySelector("strong")&&(welcome.querySelector("strong").textContent=title);welcome.querySelector("span")&&(welcome.querySelector("span").textContent=detail||"Profilini tamamladığında ana sayfa sana göre şekillenecek.");}
async function loadPreferences(){const local=readLocalPreferences();renderPreferences(local);const session=await getSession();if(!session?.user?.id)return;const{data,error}=await db.from("user_preferences").select("*").eq("id",session.user.id).maybeSingle();if(!error&&data){writeLocalPreferences({...local,...data});renderPreferences({...local,...data});}}
async function savePreferences(event){event.preventDefault();const prefs=preferencesFromForm();writeLocalPreferences(prefs);renderPreferences(prefs);const status=$("#preferencesStatus");if(status)status.textContent="Cihazında kaydedildi.";const session=await getSession();if(session?.user?.id){const{error}=await db.from("user_preferences").upsert({...prefs,id:session.user.id,study_year:prefs.study_year?Number(prefs.study_year):null,updated_at:new Date().toISOString()},{onConflict:"id"});if(error){if(status)status.textContent="Cihazında kaydedildi; hesap senkronu başarısız.";console.warn("Tercihler senkronlanamadı:",error);}else if(status)status.textContent="Hesabınla da senkronlandı."; } renderTodayFocus(); showToast("Kişisel ayarların kaydedildi.");}
function renderPreferenceChips(prefs=readLocalPreferences()){const box=$("#preferenceChips");if(box){const chips=[prefs.education_level,prefs.university,prefs.department,prefs.study_year?prefs.study_year+". sınıf":"",prefs.goal].filter(Boolean);box.innerHTML=chips.map((chip)=>"<span>"+escapeHtml(chip)+"</span>").join("");}if($("#profileSummary"))$("#profileSummary").textContent=[prefs.university,prefs.department,prefs.study_year?prefs.study_year+". sınıf":"",prefs.goal].filter(Boolean).join(" · ")||"Profilini doldurduğunda önerilerin daha kişisel hale gelir.";if($("#profileTitle"))$("#profileTitle").textContent=prefs.university||prefs.department||"Öğrenci";}
function getFocusState(){try{const raw=JSON.parse(localStorage.getItem("notora_focus_state")||"null");const today=new Date().toISOString().slice(0,10);if(!raw||raw.date!==today)return{date:today,minutes:0,streak:raw?.streak||0};return raw;}catch{return{date:new Date().toISOString().slice(0,10),minutes:0,streak:0};}}
function addFocusMinutes(minutes){const s=getFocusState();s.minutes+=Number(minutes||0);if(s.minutes>0&&!s.dayCounted){s.streak=Math.max(1,s.streak);s.dayCounted=true;}localStorage.setItem("notora_focus_state",JSON.stringify(s));updateTodayDashboard();}
function updateTodayDashboard(){const focus=getFocusState();const tasks=readTasks();if($("#todayMinutes"))$("#todayMinutes").textContent=String(focus.minutes||0);if($("#todayTasks"))$("#todayTasks").textContent=String(tasks.filter((t)=>t.done).length);if($("#todayStreak"))$("#todayStreak").textContent=String(focus.streak||0);}
function renderTodayFocus(){const prefs=readLocalPreferences();if($("#todayFocusTitle"))$("#todayFocusTitle").textContent=prefs.goal?"Bugünkü hedef: "+prefs.goal:"Bugünkü çalışma oturumunu başlat.";if($("#todayFocusText"))$("#todayFocusText").textContent="Günlük hedefin "+(prefs.daily_minutes||60)+" dakika. Bir oturum başlatıp tek konuya odaklan.";updateTodayDashboard();}
const routeTitles={home:"Ana Sayfa",discover:"Keşfet",catalog:"Üniversite & Bölüm",roadmap:"Yol Haritası",calendar:"Takvim",tools:"Çalışma",community:"Topluluk",profile:"Profil"};
function currentRoute(){const raw=window.location.hash.replace(/^#\/?/,"").split("?")[0];return routeTitles[raw]?raw:"home";}
function renderRoute(){
  const route=currentRoute();
  $$("[data-route]").forEach((page)=>page.classList.toggle("active",page.dataset.route===route));
  $$("[data-route-link]").forEach((link)=>link.classList.toggle("active",link.dataset.routeLink===route));
  document.title="Notora — "+routeTitles[route];
  if($("#commandPageTitle"))$("#commandPageTitle").textContent=routeTitles[route];
  if(route==="catalog")loadCatalog();
  if(route==="roadmap")renderRoadmap();
  if(route==="discover"||route==="calendar")loadAll();
}
function openNoteReader(note){const modal=$("#readerModal"),frame=$("#readerFrame"),fallback=$("#readerFallback");if(!modal||!frame)return;const url=SUPABASE_URL+"/storage/v1/object/public/note-files/"+note.file_path.split("/").map(encodeURIComponent).join("/");const isPdf=/\.pdf$/i.test(note.file_name||note.file_path);$("#readerTitle").textContent=note.title||"Öğrenci kaynağı";$("#readerMeta").textContent=[note.department,note.study_year?note.study_year+". sınıf":"",note.content_type].filter(Boolean).join(" · ");frame.classList.toggle("hidden",!isPdf);fallback.classList.toggle("hidden",isPdf);if(isPdf){frame.src=url;fallback.innerHTML='<a class="primary-btn" href="'+escapeHtml(url)+'" target="_blank" rel="noopener">PDF’yi aç</a>';}else{frame.removeAttribute("src");fallback.innerHTML='<b>Bu dosya türü tarayıcı içinde önizlenemiyor.</b><p>Dosya Notora kütüphanesinde tutuluyor.</p><a class="secondary-btn" href="'+escapeHtml(url)+'" target="_blank" rel="noopener">Dosyayı aç</a>';}modal.classList.remove("hidden");}
async function shareProfileView(){const url=new URL(window.location.href);url.search="";url.hash="#/profile";try{await navigator.clipboard.writeText(url.toString());showToast("Profil bağlantısı kopyalandı.");}catch{window.prompt("Bağlantıyı kopyala:",url.toString());}}
function buildShareUrl() {
  const url = new URL(window.location.href);
  url.hash = "#/discover";
  url.search = "";
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.tab !== "all") params.set("tab", state.tab);
  if (state.department !== "all") params.set("department", state.department);
  if (state.year !== "all") params.set("year", state.year);
  if (state.topic !== "all") params.set("topic", state.topic);
  if (state.type !== "all") params.set("type", state.type);
  url.search = params.toString();
  return url.toString();
}

async function shareCurrentView() {
  const url = buildShareUrl();
  try {
    await navigator.clipboard.writeText(url);
    showToast("Bölüm/filtre bağlantısı panoya kopyalandı.");
  } catch {
    window.prompt("Bağlantıyı kopyala:", url);
  }
}

function applySharedView() {
  const params = new URLSearchParams(window.location.search);
  const allowedTabs = new Set(["all", "resource", "note", "event"]);
  const tab = params.get("tab");
  const assignments = {
    q: "searchInput",
    department: "departmentSelect",
    year: "yearSelect",
    topic: "topicSelect",
    type: "typeSelect",
  };

  if (params.get("q")) {
    state.q = params.get("q").slice(0, 120);
    $("#searchInput").value = state.q;
  }

  for (const [key, id] of Object.entries(assignments)) {
    if (key === "q") continue;
    const value = params.get(key);
    const input = $("#" + id);
    if (value && input) {
      const valid = input.tagName === "INPUT" ? value.length <= 120 : [...(input.options || [])].some((option) => option.value === value);
      if (valid) { input.value = value; state[key] = value; }
    }
  }

  if (tab && allowedTabs.has(tab)) {
    state.tab = tab;
    $(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  }
}


function bindCatalogEvents() {
  $("#catalogSearch")?.addEventListener("input",(event)=>{catalogState.q=event.target.value;catalogState.page=1;renderCatalog();});
  $("#catalogLevel")?.addEventListener("change",(event)=>{catalogState.level=event.target.value;catalogState.page=1;renderCatalog();});
  $("#catalogCity")?.addEventListener("change",(event)=>{catalogState.city=event.target.value;catalogState.page=1;renderCatalog();});
  $$(".catalog-tab").forEach((button)=>button.addEventListener("click",()=>{$$(".catalog-tab").forEach((item)=>item.classList.remove("active"));button.classList.add("active");catalogState.kind=button.dataset.kind;catalogState.page=1;$("#catalogCity")?.classList.toggle("hidden",!["universities","offers"].includes(catalogState.kind));$("#catalogLevel")?.classList.toggle("hidden",catalogState.kind==="universities"||catalogState.kind==="levels");renderCatalog();}));
  $("#catalogPagination")?.addEventListener("click",(event)=>{const button=event.target.closest("[data-catalog-page]");if(!button||button.disabled)return;catalogState.page=Number(button.dataset.catalogPage);renderCatalog();});
  $("#catalogGrid")?.addEventListener("click",(event)=>{const levelButton=event.target.closest("[data-education-level]");if(!levelButton)return;const key=levelButton.dataset.educationLevel;if(key==="undergrad"||key==="associate"){catalogState.kind="programs";catalogState.level=key==="associate"?"Ön Lisans":"Lisans";catalogState.page=1;$$(".catalog-tab").forEach((item)=>item.classList.toggle("active",item.dataset.kind==="programs"));if($("#catalogLevel"))$("#catalogLevel").value=catalogState.level;renderCatalog();}else showToast("Bu düzey için resmî veri eklenmeden sayı gösterilmiyor; kaynak alanı hazır.");});
  $$(".level-card").forEach((button)=>button.addEventListener("click",()=>{$$(".level-card").forEach((item)=>item.classList.remove("active"));button.classList.add("active");const view=button.dataset.levelView;if(view==="undergraduate"){catalogState.kind="programs";catalogState.level="all";}else catalogState.kind="levels";catalogState.page=1;$$(".catalog-tab").forEach((item)=>item.classList.toggle("active",item.dataset.kind===catalogState.kind));renderCatalog();}));
}
function bindEvents() {
  [
    ["department", "departmentSelect"],
    ["year", "yearSelect"],
    ["topic", "topicSelect"],
    ["type", "typeSelect"],
    ["authority", "authoritySelect"],
  ].forEach(([key, id]) => {
    const control = $("#" + id);
    const eventName = control?.tagName === "INPUT" ? "input" : "change";
    control?.addEventListener(eventName, (event) => { state[key] = event.target.value || "all"; loadAll(); });
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
  document.querySelectorAll(".year-tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".year-tab").forEach((item) => item.classList.remove("active"));
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
    const roadmapButton = event.target.closest("[data-open-roadmap]");

    if (resourceButton) {
      const resource = cache.resources.find(
        (item) => item.id === Number(resourceButton.dataset.openResource)
      );
      if (resource) window.open(resource.source_url, "_blank", "noopener");
    }

    if (previewButton) {
      const note = cache.notes.find((item)=>item.id===Number(previewButton.dataset.notePreview));
      if(note?.file_path) openNoteReader(note); else showToast("Bu notta henüz dosya yok.");
    }

    if (downloadButton) downloadNote(Number(downloadButton.dataset.noteDownload));
    if (likeButton) toggleLike(Number(likeButton.dataset.noteLike));
    if (saveButton) toggleSave(Number(saveButton.dataset.noteSave));
    if (rateButton) rateNote(Number(rateButton.dataset.noteRate));
    if (roadmapButton) {
      $("#roadmapDomain").value = roadmapButton.dataset.domain;
      document.querySelectorAll(".year-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.year === roadmapButton.dataset.year));
      document.querySelector("#roadmap")?.scrollIntoView({ behavior: "smooth", block: "start" });
      renderRoadmap();
    }
  });

  ["#shareBtn", "#shareBtn2"].forEach((selector) => {
    $(selector).addEventListener("click", async () => {
      if (await requireUser()) openModal("#shareModal");
    });
  });

  $("#authBtn").addEventListener("click", async () => {
    if (await getSession()) {
      window.location.hash = "#/profile";
      return;
    }
    openModal("#authModal");
  });

  $("#signOutBtn")?.addEventListener("click", async () => {
    const session = await getSession();
    if (!session) { openModal("#authModal"); return; }
    const { error } = await db.auth.signOut();
    if (error) { showToast("Çıkış yapılamadı."); return; }
    showToast("Çıkış yapıldı.");
    refreshAuthUi(null);
  });

  $$(".modal [data-close]").forEach((button) => {
    button.addEventListener("click", closeModals);
  });

  $("#authSwitch").addEventListener("click", () => {
    const isLogin = $("#authNameWrap").classList.contains("hidden");
    setAuthMode(isLogin ? "signup" : "login");
  });

  $("#authPasswordToggle")?.addEventListener("click", () => {
    const input = $("#authPassword");
    const button = $("#authPasswordToggle");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.textContent = show ? "Gizle" : "Göster";
  });

  $("#authForm").addEventListener("submit", submitAuth);
  $("#shareForm").addEventListener("submit", shareNote);

  $("#sharePageBtn")?.addEventListener("click", shareCurrentView);
  $("#shareProfileBtn")?.addEventListener("click", shareProfileView);
  $("#preferencesForm")?.addEventListener("submit", savePreferences);
  $("#authProfileBtn")?.addEventListener("click", () => $("#authBtn")?.click());
  window.addEventListener("hashchange", renderRoute);

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

}

addCourseRow();
renderTasks();
renderTimer();
renderPreferences();
renderTodayFocus();
applySharedView();
bindEvents();
bindCatalogEvents();
renderRoute();

authSubscription = db.auth.onAuthStateChange((_event, session) => {
  queueMicrotask(() => { refreshAuthUi(session); loadPreferences().catch(() => {}); });
});

(async () => {
  await refreshAuthUi();
  await loadPreferences();
  renderTodayFocus();
  await Promise.allSettled([loadAll(), renderRoadmap(), loadCatalog()]);
})();
