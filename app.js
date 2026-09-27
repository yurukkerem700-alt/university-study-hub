const notes = [
  {
    id: 1,
    title: 'Veri Yapıları: Ağacın Temelleri ve AVL Analizi',
    department: 'Bilgisayar Mühendisliği',
    year: '3',
    topic: 'Veri Yapıları',
    type: 'Ders Notu',
    university: 'İstanbul Teknik Üniversitesi',
    lecturer: 'Dr. Elif Demir',
    rating: 4.9,
    downloads: 4280,
    likes: 316,
    date: '4 gün önce',
    badge: 'Özellikle yararlı'
  },
  {
    id: 2,
    title: 'Makro Ekonomi Sınav Özet Notları',
    department: 'İktisat',
    year: '2',
    topic: 'Makro Ekonomi',
    type: 'Sınav Hazırlık',
    university: 'Boğaziçi Üniversitesi',
    lecturer: 'Prof. Ahmet Yılmaz',
    rating: 4.8,
    downloads: 3510,
    likes: 244,
    date: '2 gün önce',
    badge: 'Sınav canlısı'
  },
  {
    id: 3,
    title: 'İnternet Hukuku: Kişisel Veri ve Tüketici Hakları',
    department: 'Hukuk',
    year: '4',
    topic: 'İnternet Hukuku',
    type: 'Özet',
    university: 'Ankara Üniversitesi',
    lecturer: 'Doç. Filiz Erdem',
    rating: 5.0,
    downloads: 2875,
    likes: 301,
    date: '1 hafta önce',
    badge: 'Yeni'
  },
  {
    id: 4,
    title: 'Anatomi Ders Notu: Solunum ve Dolaşım Sistemi',
    department: 'Tıp',
    year: '2',
    topic: 'Anatomi',
    type: 'Slayt',
    university: 'Hacettepe Üniversitesi',
    lecturer: 'Prof. Deniz Arslan',
    rating: 4.9,
    downloads: 6210,
    likes: 420,
    date: '3 gün önce',
    badge: 'Popüler'
  },
  {
    id: 5,
    title: 'Devre Analizi: AC ve DC Analizi Kolaylaştırılmış',
    department: 'Elektrik-Elektronik Mühendisliği',
    year: '3',
    topic: 'Devre Analizi',
    type: 'Ders Notu',
    university: 'Ege Üniversitesi',
    lecturer: 'Dr. Serkan Kaya',
    rating: 4.7,
    downloads: 2490,
    likes: 192,
    date: '5 gün önce',
    badge: 'Kısa anlatım'
  },
  {
    id: 6,
    title: 'İstatistik Final Hazırlık: Olasılık ve Dağılımlar',
    department: 'İktisat',
    year: '1',
    topic: 'Makro Ekonomi',
    type: 'Sınav Hazırlık',
    university: 'Sabancı Üniversitesi',
    lecturer: 'Prof. Büşra Şahin',
    rating: 4.8,
    downloads: 1988,
    likes: 148,
    date: '6 saat önce',
    badge: 'Hızlı tekrar'
  }
];

const state = {
  search: '',
  department: 'all',
  year: 'all',
  topic: 'all',
  type: 'all',
  mode: 'student'
};

const searchInput = document.getElementById('searchInput');
const departmentSelect = document.getElementById('departmentSelect');
const yearSelect = document.getElementById('yearSelect');
const topicSelect = document.getElementById('topicSelect');
const typeSelect = document.getElementById('typeSelect');
const notesGrid = document.getElementById('notesGrid');
const resetFiltersBtn = document.getElementById('resetFilters');
const toast = document.getElementById('toast');
const teacherModal = document.getElementById('teacherModal');

function filterNotes() {
  return notes.filter((note) => {
    const matchesSearch = [
      note.title,
      note.department,
      note.topic,
      note.lecturer,
      note.university
    ]
      .join(' ')
      .toLowerCase()
      .includes(state.search.toLowerCase());

    const matchesDepartment =
      state.department === 'all' || note.department === state.department;
    const matchesYear = state.year === 'all' || note.year === state.year;
    const matchesTopic = state.topic === 'all' || note.topic === state.topic;
    const matchesType = state.type === 'all' || note.type === state.type;

    return matchesSearch && matchesDepartment && matchesYear && matchesTopic && matchesType;
  });
}

function formatDownloads(value) {
  return new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function renderNotes() {
  const filtered = filterNotes();

  if (!filtered.length) {
    notesGrid.innerHTML = `
      <div class="note-card" style="grid-column: 1 / -1;">
        <div class="note-kicker">Sonuç bulunamadı</div>
        <h3>Aramanıza uygun içerik bulunamadı.</h3>
        <p class="note-meta">Filtreleri değiştirerek daha geniş bir sonuç seti alabilirsiniz.</p>
      </div>
    `;
    return;
  }

  notesGrid.innerHTML = filtered
    .map(
      (note) => `
        <article class="note-card" aria-label="${note.title}">
          <div class="note-top">
            <div>
              <span class="note-kicker">${note.type}</span>
            </div>
            <span class="badge">${note.badge}</span>
          </div>

          <h3>${note.title}</h3>
          <div class="note-meta">
            <div><strong>${note.department}</strong> · ${note.university}</div>
            <div>${note.lecturer} · ${note.year}. sınıf</div>
          </div>

          <div class="note-footer">
            <div class="score-row">
              <span>⭐ ${note.rating}</span>
              <span>⬇ ${formatDownloads(note.downloads)}</span>
              <span>♥ ${note.likes}</span>
            </div>

            <div class="note-actions">
              <button class="ghost-btn small" type="button" data-action="preview" data-id="${note.id}">Önizle</button>
              <button class="secondary-btn small" type="button" data-action="download" data-id="${note.id}">İndir</button>
            </div>
          </div>
        </article>
      `
    )
    .join('');
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => toast.classList.remove('show'), 1800);
}

function handleDownload(event) {
  const button = event.target.closest('[data-action="download"]');
  if (!button) return;

  const id = Number(button.dataset.id);
  const match = notes.find((note) => note.id === id);
  if (!match) return;

  match.downloads += 22;
  renderNotes();
  showToast(`${match.title} indiriliyor...`);
}

function handlePreview(event) {
  const button = event.target.closest('[data-action="preview"]');
  if (!button) return;

  const id = Number(button.dataset.id);
  const match = notes.find((note) => note.id === id);
  if (!match) return;

  showToast(`${match.title} önizlemede açıldı.`);
}

function resetFilters() {
  state.search = '';
  state.department = 'all';
  state.year = 'all';
  state.topic = 'all';
  state.type = 'all';

  searchInput.value = '';
  departmentSelect.value = 'all';
  yearSelect.value = 'all';
  topicSelect.value = 'all';
  typeSelect.value = 'all';

  renderNotes();
}

function attachFilterEvents() {
  searchInput.addEventListener('input', (event) => {
    state.search = event.target.value;
    renderNotes();
  });

  departmentSelect.addEventListener('change', (event) => {
    state.department = event.target.value;
    renderNotes();
  });

  yearSelect.addEventListener('change', (event) => {
    state.year = event.target.value;
    renderNotes();
  });

  topicSelect.addEventListener('change', (event) => {
    state.topic = event.target.value;
    renderNotes();
  });

  typeSelect.addEventListener('change', (event) => {
    state.type = event.target.value;
    renderNotes();
  });

  resetFiltersBtn.addEventListener('click', resetFilters);
  notesGrid.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="download"]')) {
      handleDownload(event);
    }

    if (event.target.closest('[data-action="preview"]')) {
      handlePreview(event);
    }
  });
}

function setMode(mode) {
  state.mode = mode;

  document.querySelectorAll('.segment').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === mode);
  });

  const teacherSection = document.getElementById('teacher');
  const communityCards = document.querySelectorAll('.community-card');

  if (mode === 'teacher') {
    teacherSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    communityCards.forEach((card) => {
      card.style.filter = 'saturate(0.9)';
    });
  } else {
    communityCards.forEach((card) => {
      card.style.filter = 'none';
    });
  }
}

function bindModeToggles() {
  document.querySelectorAll('.segment').forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  });

  document.querySelector('.teacher-login-trigger').addEventListener('click', () => {
    teacherModal.classList.remove('hidden');
    teacherModal.setAttribute('aria-hidden', 'false');
  });

  document.querySelector('[data-close="modal"]').addEventListener('click', () => {
    teacherModal.classList.add('hidden');
    teacherModal.setAttribute('aria-hidden', 'true');
  });

  document.querySelector('.modal-close').addEventListener('click', () => {
    teacherModal.classList.add('hidden');
    teacherModal.setAttribute('aria-hidden', 'true');
  });

  document.querySelector('.teacher-form').addEventListener('submit', (event) => {
    event.preventDefault();
    showToast('Öğretmen paneline giriş yapıldı.');
    teacherModal.classList.add('hidden');
    teacherModal.setAttribute('aria-hidden', 'true');
  });
}

function init() {
  renderNotes();
  attachFilterEvents();
  bindModeToggles();
}

init();

