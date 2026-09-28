const notes = [
  { id: 1, title: 'Veri Yapıları: Ağacın Temelleri ve AVL Analizi', department: 'Bilgisayar Mühendisliği', year: '3', topic: 'Veri Yapıları', type: 'Ders Notu', university: 'İstanbul Teknik Üniversitesi', lecturer: 'Dr. Elif Demir', rating: 4.9, downloads: 4280, likes: 316, date: '4 gün önce', badge: 'Özellikle yararlı' },
  { id: 2, title: 'Makro Ekonomi Sınav Özet Notları', department: 'İktisat', year: '2', topic: 'Makro Ekonomi', type: 'Sınav Hazırlık', university: 'Boğaziçi Üniversitesi', lecturer: 'Prof. Ahmet Yılmaz', rating: 4.8, downloads: 3510, likes: 244, date: '2 gün önce', badge: 'Sınav canlısı' },
  { id: 3, title: 'İnternet Hukuku: Kişisel Veri ve Tüketici Hakları', department: 'Hukuk', year: '4', topic: 'İnternet Hukuku', type: 'Özet', university: 'Ankara Üniversitesi', lecturer: 'Doç. Filiz Erdem', rating: 5, downloads: 2875, likes: 301, date: '1 hafta önce', badge: 'Yeni' },
  { id: 4, title: 'Anatomi Ders Notu: Solunum ve Dolaşım Sistemi', department: 'Tıp', year: '2', topic: 'Anatomi', type: 'Slayt', university: 'Hacettepe Üniversitesi', lecturer: 'Prof. Deniz Arslan', rating: 4.9, downloads: 6210, likes: 420, date: '3 gün önce', badge: 'Popüler' },
  { id: 5, title: 'Devre Analizi: AC ve DC Analizi Kolaylaştırılmış', department: 'Elektrik-Elektronik Mühendisliği', year: '3', topic: 'Devre Analizi', type: 'Ders Notu', university: 'Ege Üniversitesi', lecturer: 'Dr. Serkan Kaya', rating: 4.7, downloads: 2490, likes: 192, date: '5 gün önce', badge: 'Kısa anlatım' },
  { id: 6, title: 'İstatistik Final Hazırlık: Olasılık ve Dağılımlar', department: 'İktisat', year: '1', topic: 'Makro Ekonomi', type: 'Sınav Hazırlık', university: 'Sabancı Üniversitesi', lecturer: 'Prof. Büşra Şahin', rating: 4.8, downloads: 1988, likes: 148, date: '6 saat önce', badge: 'Hızlı tekrar' }
];

const state = { search: '', department: 'all', year: 'all', topic: 'all', type: 'all', mode: 'student', sortBy: 'popular' };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const elements = {
  search: $('#searchInput'), department: $('#departmentSelect'), year: $('#yearSelect'), topic: $('#topicSelect'), type: $('#typeSelect'),
  grid: $('#notesGrid'), reset: $('#resetFilters'), toast: $('#toast'), modal: $('#teacherModal'), form: $('.teacher-form')
};

function showToast(message) {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove('show'), 2200);
}

function normalize(value) { return String(value).toLocaleLowerCase('tr-TR').trim(); }

function filterNotes() {
  const query = normalize(state.search);
  return notes.filter((note) => {
    const searchable = normalize([note.title, note.department, note.topic, note.lecturer, note.university].join(' '));
    return (!query || searchable.includes(query)) &&
      (state.department === 'all' || note.department === state.department) &&
      (state.year === 'all' || note.year === state.year) &&
      (state.topic === 'all' || note.topic === state.topic) &&
      (state.type === 'all' || note.type === state.type);
  });
}

function formatNumber(value) {
  return new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function sortedNotes() {
  const result = [...filterNotes()];
  if (state.sortBy === 'newest') {
    const age = { '6 saat önce': 0, '2 gün önce': 1, '3 gün önce': 2, '4 gün önce': 3, '5 gün önce': 4, '1 hafta önce': 5 };
    return result.sort((a, b) => (age[a.date] ?? 99) - (age[b.date] ?? 99));
  }
  return result.sort((a, b) => b.downloads - a.downloads);
}

function renderNotes() {
  const visible = sortedNotes();
  if (!visible.length) {
    elements.grid.innerHTML = '<div class="note-card empty-state" style="grid-column:1/-1"><div class="note-kicker">Sonuç bulunamadı</div><h3>Aramanıza uygun içerik bulunamadı.</h3><p class="note-meta">Filtreleri değiştirerek daha geniş bir sonuç seti alabilirsiniz.</p></div>';
    return;
  }
  elements.grid.innerHTML = visible.map((note) => `
    <article class="note-card" aria-label="${note.title}">
      <div class="note-top"><span class="note-kicker">${note.type}</span><span class="badge">${note.badge}</span></div>
      <h3>${note.title}</h3>
      <div class="note-meta"><div><strong>${note.department}</strong> · ${note.university}</div><div>${note.lecturer} · ${note.year}. sınıf</div></div>
      <div class="note-footer"><div class="score-row"><span>⭐ ${note.rating}</span><span>⬇ ${formatNumber(note.downloads)}</span><span>♥ ${note.likes}</span></div><div class="note-actions"><button class="ghost-btn small" type="button" data-action="preview" data-id="${note.id}">Önizle</button><button class="secondary-btn small" type="button" data-action="download" data-id="${note.id}">İndir</button></div></div>
    </article>`).join('');
}

function setFilter(name, value) { state[name] = value; renderNotes(); }

function resetFilters() {
  Object.assign(state, { search: '', department: 'all', year: 'all', topic: 'all', type: 'all' });
  elements.search.value = '';
  ['department', 'year', 'topic', 'type'].forEach((key) => { elements[key].value = 'all'; });
  $$('.quick-tags .chip').forEach((chip, index) => chip.classList.toggle('active', index === 0));
  renderNotes();
  showToast('Filtreler temizlendi');
}

function closeModal() {
  elements.modal.classList.add('hidden');
  elements.modal.setAttribute('aria-hidden', 'true');
}

function openModal() {
  elements.modal.classList.remove('hidden');
  elements.modal.setAttribute('aria-hidden', 'false');
  elements.form?.querySelector('input')?.focus();
}

function bindEvents() {
  elements.search.addEventListener('input', (event) => setFilter('search', event.target.value));
  elements.search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') showToast(state.search.trim() ? `"${state.search.trim()}" için arama yapılıyor...` : 'Bir arama terimi girin');
  });
  ['department', 'year', 'topic', 'type'].forEach((key) => elements[key].addEventListener('change', (event) => setFilter(key, event.target.value)));
  elements.reset.addEventListener('click', resetFilters);

  elements.grid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const note = notes.find((item) => item.id === Number(button.dataset.id));
    if (!note) return;
    if (button.dataset.action === 'download') {
      note.downloads += 1;
      renderNotes();
      showToast(`${note.title} indiriliyor...`);
    } else showToast(`${note.title} önizlemede açıldı.`);
  });

  $$('.quick-tags .chip').forEach((chip) => chip.addEventListener('click', () => {
    const map = { Mühendislik: 'Bilgisayar Mühendisliği', İktisat: 'İktisat', Hukuk: 'Hukuk', Tıp: 'Tıp' };
    $$('.quick-tags .chip').forEach((item) => item.classList.remove('active'));
    chip.classList.add('active');
    const value = map[chip.textContent.trim()] || 'all';
    elements.department.value = value;
    setFilter('department', value);
    showToast(`${chip.textContent.trim()} bölümü seçildi`);
  }));

  $('.search-btn')?.addEventListener('click', () => showToast(state.search.trim() ? `"${state.search.trim()}" için arama yapılıyor...` : 'Lütfen bir arama terimi girin'));
  $('.library-header .secondary-btn')?.addEventListener('click', (event) => {
    state.sortBy = state.sortBy === 'popular' ? 'newest' : 'popular';
    event.currentTarget.textContent = state.sortBy === 'popular' ? 'Yeni eklenenler' : 'En popüler';
    renderNotes();
    showToast(state.sortBy === 'popular' ? 'En popüler kaynaklar gösteriliyor' : 'Yeni eklenenler gösteriliyor');
  });

  $('.header-actions .ghost-btn')?.addEventListener('click', openModal);
  $('.header-actions .primary-btn')?.addEventListener('click', () => showToast('Not paylaşım formu yakında kullanıma açılacak.'));
  $('.teacher-login-trigger')?.addEventListener('click', openModal);
  $('.modal-close')?.addEventListener('click', closeModal);
  $('[data-close="modal"]')?.addEventListener('click', closeModal);
  elements.form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!elements.form.checkValidity()) { elements.form.reportValidity(); return; }
    closeModal();
    elements.form.reset();
    showToast('Giriş bilgileri alındı. Demo modunda panel açıldı.');
  });

  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !elements.modal.classList.contains('hidden')) closeModal(); });
  $$('.segment').forEach((button) => button.addEventListener('click', () => {
    state.mode = button.dataset.mode;
    $$('.segment').forEach((item) => item.classList.toggle('active', item === button));
    if (state.mode === 'teacher') $('#teacher')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast(state.mode === 'teacher' ? 'Öğretmen modu etkinleştirildi' : 'Öğrenci modu etkinleştirildi');
  }));
  $$('.main-nav a').forEach((link) => link.addEventListener('click', (event) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) { event.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }));
}

renderNotes();
bindEvents();
