/* ═══════════════════════════════════════════════
   LumiRead — app.js  (Mobile-First)
   All IDs match index.html exactly
═══════════════════════════════════════════════ */
'use strict';

// ── PDF.js Worker ─────────────────────────────
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
const S = {
  library:     [],
  pdfDoc:      null,
  bookId:      null,
  page:        1,
  totalPages:  0,

  zoom:        1.2,
  fitMode:     'width',
  scrollMode:  false,
  rendered:    {},
  textCache:   {},

  darkMode:    false,
  drawMode:    false,
  focusMode:   false,
  drawColour:  '#4F46E5',

  hiliteColour: '#FFEAA7',
  notes:        {},
  bookmarks:    {},
  hilites:      {},
  stickies:     {},

  searchHits:  [],
  searchIdx:   0,

  ttsOn:       false,
  ttsUtterance: null,
  sessionStart: null,
  todayMs:     0,
  streak:      {},
  password:    null,
  pendingId:   null,

  drawCtx:     null,
  drawing:     false,
};

// ═══════════════════════════════════════════════
// INDEXED DB
// ═══════════════════════════════════════════════
const DB = {
  _db: null,
  NAME: 'lumiread5',
  VER: 1,

  open() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(this.NAME, this.VER);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('meta'))  d.createObjectStore('meta',  { keyPath: 'id' });
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs', { keyPath: 'id' });
      };
      req.onsuccess = e => { this._db = e.target.result; res(); };
      req.onerror   = () => rej(req.error);
    });
  },

  tx(store, mode = 'readonly') {
    return this._db.transaction(store, mode).objectStore(store);
  },

  put(store, obj) {
    return new Promise((res, rej) => {
      const r = this.tx(store, 'readwrite').put(obj);
      r.onsuccess = res; r.onerror = () => rej(r.error);
    });
  },

  get(store, id) {
    return new Promise((res, rej) => {
      const r = this.tx(store).get(id);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  },

  getAll(store) {
    return new Promise((res, rej) => {
      const r = this.tx(store).getAll();
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  },

  del(store, id) {
    return new Promise((res, rej) => {
      const r = this.tx(store, 'readwrite').delete(id);
      r.onsuccess = res; r.onerror = () => rej(r.error);
    });
  },
};

// ═══════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════
function save() {
  try {
    localStorage.setItem('lr5', JSON.stringify({
      darkMode:  S.darkMode,
      notes:     S.notes,
      bookmarks: S.bookmarks,
      hilites:   S.hilites,
      stickies:  S.stickies,
      streak:    S.streak,
      todayMs:   S.todayMs,
      password:  S.password,
    }));
  } catch (_) {}
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem('lr5') || '{}');
    S.darkMode  = !!d.darkMode;
    S.notes     = d.notes     || {};
    S.bookmarks = d.bookmarks || {};
    S.hilites   = d.hilites   || {};
    S.stickies  = d.stickies  || {};
    S.streak    = d.streak    || {};
    S.todayMs   = d.todayMs   || 0;
    S.password  = d.password  || null;
  } catch (_) {}
}

// ═══════════════════════════════════════════════
// DOM REFS  — every ID verified against index.html
// ═══════════════════════════════════════════════
const $ = id => document.getElementById(id);

// Screens
const screenLanding = $('screenLanding');
const screenReader  = $('screenReader');

// Landing
const themeToggleLib = $('themeToggleLib');
const fileInput      = $('fileInput');
const uploadZone     = $('uploadZone');
const libSearch      = $('libSearch');
const clearLibBtn    = $('clearLibBtn');
const libraryGrid    = $('libraryGrid');
const streakCount    = $('streakCount');
const totalTimeEl    = $('totalTime');
const bookCountEl    = $('bookCount');

// Reader top
const backToLib        = $('backToLib');
const bookTitle        = $('bookTitle');
const themeToggleRdr   = $('themeToggleReader');
const menuBtn          = $('menuBtn');

// Progress
const progFill = $('progFill');

// PDF area
const pdfArea     = $('pdfArea');
const pdfScroller = $('pdfScroller');
const pdfPages    = $('pdfPages');
const drawCanvas  = $('drawCanvas');
const stickyLayer = $('stickyLayer');

// Bottom bar
const prevPageBtn     = $('prevPage');
const nextPageBtn     = $('nextPage');
const pageInput       = $('pageInput');
const totalPagesLabel = $('totalPagesLabel');
const notesTabBtn     = $('notesTabBtn');
const bookmarkTabBtn  = $('bookmarkTabBtn');
const searchTabBtn    = $('searchTabBtn');
const hiliteTabBtn    = $('hiliteTabBtn');
const moreTabBtn      = $('moreTabBtn');

// Sheet backdrop
const sheetBackdrop = $('sheetBackdrop');

// Notes sheet
const sheetNotes    = $('sheetNotes');
const notesPgLbl    = $('notesPgLbl');
const notesEditor   = $('notesEditor');
const saveNoteBtn   = $('saveNoteBtn');
const noteSavedMsg  = $('noteSavedMsg');
const allNotesList  = $('allNotesList');

// Bookmarks sheet
const sheetBookmarks = $('sheetBookmarks');
const addBookmarkBtn = $('addBookmarkBtn');
const bmList         = $('bmList');

// Search sheet
const sheetSearch   = $('sheetSearch');
const searchInput   = $('searchInput');
const searchBtn     = $('searchBtn');
const prevMatchBtn  = $('prevMatch');
const nextMatchBtn  = $('nextMatch');
const matchLabel    = $('matchLabel');
const searchResults = $('searchResults');

// Highlight sheet
const sheetHilite = $('sheetHilite');
const swatchRow   = $('swatchRow');
const hiliteList  = $('hiliteList');

// More sheet
const sheetMore      = $('sheetMore');
const zoomOutBtn     = $('zoomOut');
const zoomInBtn      = $('zoomIn');
const zoomLabel      = $('zoomLabel');
const fitWidthBtn    = $('fitWidthBtn');
const fitPageBtn     = $('fitPageBtn');
const scrollModeBtn  = $('scrollModeBtn');
const ttsBtn         = $('ttsBtn');
const focusBtn       = $('focusBtn');
const drawBtn        = $('drawBtn');
const drawColourPkr  = $('drawColourPicker');
const addStickyBtn   = $('addStickyBtn');
const studyModeBtn   = $('studyModeBtn');
const genSummaryBtn  = $('genSummaryBtn');
const summaryBox     = $('summaryBox');
const exportTxtBtn   = $('exportTxtBtn');
const exportMdBtn    = $('exportMdBtn');
const exportPdfBtn   = $('exportPdfBtn');
const lockBtn        = $('lockBtn');
const dictBox        = $('dictBox');

// Lock modal
const lockModal      = $('lockModal');
const lockModalTitle = $('lockModalTitle');
const lockInput      = $('lockInput');
const lockConfirm    = $('lockConfirm');
const lockCancel     = $('lockCancel');

// Word popup
const wordPopup = $('wordPopup');
const wpClose   = $('wpClose');
const wpWord    = $('wpWord');
const wpPhon    = $('wpPhon');
const wpPos     = $('wpPos');
const wpDef     = $('wpDef');

// TTS bar
const ttsBar     = $('ttsBar');
const ttsLabel   = $('ttsLabel');
const ttsStopBtn = $('ttsStopBtn');

// Toast
const toastEl = $('toast');

// ═══════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════
const uid    = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const today  = () => new Date().toISOString().slice(0, 10);
const fmtMs  = ms => { const m = Math.floor(ms / 60000); return m < 60 ? m + 'm' : Math.floor(m/60) + 'h ' + (m%60) + 'm'; };
const esc    = s  => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

let _toastT;
function toast(msg, ms = 2800) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(_toastT);
  _toastT = setTimeout(() => toastEl.classList.remove('show'), ms);
}

// ═══════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════
function applyTheme() {
  document.body.classList.toggle('dark', S.darkMode);
  const ico = S.darkMode ? '☀️' : '🌙';
  themeToggleLib.textContent = ico;
  themeToggleRdr.textContent = ico;
}
themeToggleLib.addEventListener('click', () => { S.darkMode = !S.darkMode; applyTheme(); save(); });
themeToggleRdr.addEventListener('click', () => { S.darkMode = !S.darkMode; applyTheme(); save(); });

// ═══════════════════════════════════════════════
// SCREENS
// ═══════════════════════════════════════════════
function showScreen(name) {
  screenLanding.classList.toggle('active', name === 'landing');
  screenReader.classList.toggle('active',  name === 'reader');
}

// ═══════════════════════════════════════════════
// BOTTOM SHEETS
// ═══════════════════════════════════════════════
let _activeSheet = null;

function openSheet(sheet) {
  closeSheet();
  _activeSheet = sheet;
  sheetBackdrop.classList.remove('hidden');
  sheet.classList.remove('hidden');
  // Trigger animation next frame
  requestAnimationFrame(() => sheet.classList.add('open'));
}

function closeSheet() {
  if (_activeSheet) {
    _activeSheet.classList.remove('open');
    setTimeout(() => {
      if (_activeSheet) _activeSheet.classList.add('hidden');
      _activeSheet = null;
    }, 280);
  }
  sheetBackdrop.classList.add('hidden');
  // Reset bottom tab button highlights
  [notesTabBtn, bookmarkTabBtn, searchTabBtn, hiliteTabBtn, moreTabBtn]
    .forEach(b => b.classList.remove('on'));
}

sheetBackdrop.addEventListener('click', closeSheet);

// Close buttons inside sheets
document.querySelectorAll('.sheet-x').forEach(btn => {
  btn.addEventListener('click', closeSheet);
});

// Bottom tab buttons
notesTabBtn.addEventListener('click', () => {
  if (_activeSheet === sheetNotes) { closeSheet(); return; }
  openSheet(sheetNotes);
  notesTabBtn.classList.add('on');
  loadNote(S.page);
  refreshAllNotes();
});

bookmarkTabBtn.addEventListener('click', () => {
  if (_activeSheet === sheetBookmarks) { closeSheet(); return; }
  openSheet(sheetBookmarks);
  bookmarkTabBtn.classList.add('on');
  refreshBookmarks();
});

searchTabBtn.addEventListener('click', () => {
  if (_activeSheet === sheetSearch) { closeSheet(); return; }
  openSheet(sheetSearch);
  searchTabBtn.classList.add('on');
  setTimeout(() => searchInput.focus(), 320);
});

hiliteTabBtn.addEventListener('click', () => {
  if (_activeSheet === sheetHilite) { closeSheet(); return; }
  openSheet(sheetHilite);
  hiliteTabBtn.classList.add('on');
  refreshHilites();
});

moreTabBtn.addEventListener('click', () => {
  if (_activeSheet === sheetMore) { closeSheet(); return; }
  openSheet(sheetMore);
  moreTabBtn.classList.add('on');
});

menuBtn.addEventListener('click', () => {
  if (_activeSheet === sheetMore) { closeSheet(); return; }
  openSheet(sheetMore);
});

// ═══════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════
function updateStats() {
  let streak = 0;
  const d = new Date();
  while (S.streak[d.toISOString().slice(0,10)]) { streak++; d.setDate(d.getDate()-1); }
  streakCount.textContent = streak;
  totalTimeEl.textContent = fmtMs(S.todayMs);
  bookCountEl.textContent = S.library.length;
}

// Track reading time
setInterval(() => {
  if (!S.sessionStart || !S.bookId) return;
  const now = Date.now();
  S.todayMs += now - S.sessionStart;
  S.sessionStart = now;
  S.streak[today()] = true;
  save();
}, 15000);

// ═══════════════════════════════════════════════
// LIBRARY
// ═══════════════════════════════════════════════
async function loadLibrary() {
  S.library = (await DB.getAll('meta')) || [];
  renderLibrary();
}

function renderLibrary(filter = '') {
  const list = filter
    ? S.library.filter(b => b.name.toLowerCase().includes(filter.toLowerCase()))
    : S.library;

  if (!list.length) {
    libraryGrid.innerHTML = '<div class="empty-lib"><span>📚</span><p>No books yet — upload a PDF above!</p></div>';
    updateStats(); return;
  }

  const GRADS = [
    'linear-gradient(135deg,#4F46E5,#2563EB)',
    'linear-gradient(135deg,#7C3AED,#4F46E5)',
    'linear-gradient(135deg,#0EA5E9,#6366F1)',
    'linear-gradient(135deg,#2563EB,#0EA5E9)',
    'linear-gradient(135deg,#6366F1,#7C3AED)',
  ];

  libraryGrid.innerHTML = list.map((b, i) => `
    <div class="book-card" data-id="${b.id}" style="animation-delay:${i*.05}s">
      <div class="book-cover" style="background:${GRADS[i % GRADS.length]}">
        📖
        <button class="book-del" data-del="${b.id}">✕</button>
      </div>
      <div class="book-body">
        <div class="book-name" title="${esc(b.name)}">${esc(b.name)}</div>
        <div class="book-meta">p.${b.lastPage||1} · ${new Date(b.added).toLocaleDateString()}</div>
        <div class="book-bar"><div class="book-bar-fill" style="width:${b.progress||0}%"></div></div>
      </div>
    </div>`).join('');

  libraryGrid.querySelectorAll('.book-card').forEach(card =>
    card.addEventListener('click', e => {
      if (e.target.closest('[data-del]')) return;
      openBook(card.dataset.id);
    }));

  libraryGrid.querySelectorAll('[data-del]').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); deleteBook(btn.dataset.del); }));

  updateStats();
}

libSearch.addEventListener('input', () => renderLibrary(libSearch.value.trim()));

clearLibBtn.addEventListener('click', async () => {
  // Use inline confirm UI instead of confirm() which can be blocked in PWA
  if (!window.confirm('Delete ALL books? This cannot be undone.')) return;
  for (const b of S.library) {
    await DB.del('meta',  b.id).catch(() => {});
    await DB.del('blobs', b.id).catch(() => {});
  }
  S.library = [];
  renderLibrary();
  save();
  toast('Library cleared');
});

// ═══════════════════════════════════════════════
// FILE UPLOAD
// ═══════════════════════════════════════════════
fileInput.addEventListener('change', e => handleFiles([...e.target.files]));

uploadZone.addEventListener('dragover',  e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', ()  => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  handleFiles([...e.dataTransfer.files].filter(f => f.type === 'application/pdf'));
});

async function handleFiles(files) {
  for (const f of files) {
    if (f.type !== 'application/pdf') { toast('⚠️ Only PDF files supported'); continue; }
    await addBook(f);
  }
}

async function addBook(file) {
  toast('⏳ Saving…');
  const bytes = await file.arrayBuffer();
  const id    = uid();
  const meta  = { id, name: file.name.replace(/\.pdf$/i,''), size: file.size, added: Date.now(), lastPage: 1, progress: 0 };
  await DB.put('meta',  meta);
  await DB.put('blobs', { id, bytes });
  S.library.push(meta);
  renderLibrary();
  save();
  toast(`✅ "${meta.name}" added!`);
}

async function deleteBook(id) {
  if (!window.confirm('Remove this book?')) return;
  await DB.del('meta',  id).catch(() => {});
  await DB.del('blobs', id).catch(() => {});
  S.library = S.library.filter(b => b.id !== id);
  renderLibrary();
  save();
  toast('Book removed');
}

// ═══════════════════════════════════════════════
// OPEN BOOK
// ═══════════════════════════════════════════════
async function openBook(id) {
  const meta = S.library.find(b => b.id === id);
  if (!meta) { toast('❌ Book not found'); return; }

  if (S.password) { S.pendingId = id; showLock('unlock'); return; }

  toast('⏳ Opening…');

  let rec;
  try { rec = await DB.get('blobs', id); }
  catch (e) { toast('❌ Storage error'); return; }

  if (!rec || !rec.bytes) { toast('❌ PDF missing — please re-upload'); return; }

  // Reset state
  S.bookId      = id;
  S.page        = meta.lastPage || 1;
  S.rendered    = {};
  S.totalPages  = 0;
  S.sessionStart = Date.now();
  S.streak[today()] = true;
  if (!S.textCache[id]) S.textCache[id] = {};

  bookTitle.textContent  = meta.name;
  pdfPages.innerHTML     = '';
  stickyLayer.innerHTML  = '';
  drawCanvas.classList.add('hidden');
  drawCanvas.classList.remove('active');
  drawBtn.classList.remove('on');
  S.drawMode = false;

  showScreen('reader');
  closeSheet();

  // Parse PDF
  let doc;
  try {
    doc = await pdfjsLib.getDocument({ data: rec.bytes.slice(0) }).promise;
  } catch (err) {
    toast('❌ Cannot open PDF: ' + err.message);
    showScreen('landing');
    return;
  }

  S.pdfDoc     = doc;
  S.totalPages = doc.numPages;
  totalPagesLabel.textContent = S.totalPages;
  pageInput.max   = S.totalPages;
  pageInput.value = S.page;

  // Wait for layout then render
  await waitForLayout();
  await renderPage(S.page);
  prefetch(S.page + 1);
  prefetch(S.page - 1);

  updateProgress();
  loadNote(S.page);
  renderStickies();
  saveMeta();

  toast(`📖 ${meta.name} · ${S.totalPages} pages`);
}

// ═══════════════════════════════════════════════
// PDF RENDERING
// ═══════════════════════════════════════════════

/**
 * Wait until pdfArea has real pixel dimensions.
 * On mobile, layout can lag several frames after screen switch.
 */
function waitForLayout() {
  return new Promise(resolve => {
    const deadline = Date.now() + 2500;
    function check() {
      const w = pdfArea.clientWidth;
      const h = pdfArea.clientHeight;
      if ((w > 20 && h > 20) || Date.now() > deadline) {
        resolve();
      } else {
        requestAnimationFrame(check);
      }
    }
    requestAnimationFrame(check);
  });
}

function prefetch(p) {
  if (p >= 1 && p <= S.totalPages && !S.rendered[p])
    renderPage(p).catch(() => {});
}

async function renderPage(pageNum) {
  if (S.rendered[pageNum]) return;
  S.rendered[pageNum] = true;

  let page;
  try { page = await S.pdfDoc.getPage(pageNum); }
  catch (e) { S.rendered[pageNum] = false; return; }

  const vp = calcViewport(page);
  const W  = Math.floor(vp.width);
  const H  = Math.floor(vp.height);

  // ── Wrapper — explicit size, position:relative so layers stack ──
  const wrap = document.createElement('div');
  wrap.className    = 'pdf-page-wrap';
  wrap.dataset.page = pageNum;
  wrap.id           = 'pp-' + pageNum;
  wrap.style.width  = W + 'px';
  wrap.style.height = H + 'px';

  // ── Canvas (visual layer, position:absolute, pointer-events:none) ──
  const canvas = document.createElement('canvas');
  const ctx    = canvas.getContext('2d');
  const dpr    = window.devicePixelRatio || 1;
  // Physical pixels = W*dpr for sharpness, CSS size = W for layout
  canvas.width        = Math.floor(W * dpr);
  canvas.height       = Math.floor(H * dpr);
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);
  wrap.appendChild(canvas);

  // ── Text layer (invisible but selectable) ──
  const textLayer = document.createElement('div');
  textLayer.className = 'pdf-text-layer';
  textLayer.style.width  = W + 'px';
  textLayer.style.height = H + 'px';
  wrap.appendChild(textLayer);

  // ── Highlight layer (coloured spans over text) ──
  const hlLayer = document.createElement('div');
  hlLayer.className      = 'pdf-hl-layer';
  hlLayer.dataset.hlPage = pageNum;
  hlLayer.style.width    = W + 'px';
  hlLayer.style.height   = H + 'px';
  wrap.appendChild(hlLayer);

  const lbl = document.createElement('div');
  lbl.className   = 'pg-num';
  lbl.textContent = pageNum + ' / ' + S.totalPages;

  // ── Insert in page order ──
  if (S.scrollMode) {
    const existing = [...pdfPages.querySelectorAll('.pdf-page-wrap')]
      .find(w => +w.dataset.page > pageNum);
    if (existing) {
      pdfPages.insertBefore(wrap, existing);
      pdfPages.insertBefore(lbl, existing);
    } else {
      pdfPages.appendChild(wrap);
      pdfPages.appendChild(lbl);
    }
  } else {
    pdfPages.innerHTML = '';
    pdfPages.appendChild(wrap);
    pdfPages.appendChild(lbl);
  }

  // ── Render canvas ──
  try {
    await page.render({
      canvasContext: ctx,
      viewport: vp,
    }).promise;
  } catch (_) {}

  // ── Render text layer so text is selectable ──
  try {
    const textContent = await page.getTextContent();

    // Cache for search/TTS
    if (!S.textCache[S.bookId]) S.textCache[S.bookId] = {};
    S.textCache[S.bookId][pageNum] = textContent.items.map(i => i.str).join(' ');

    // PDF.js 3.x renderTextLayer — use textContent (not textContentSource)
    // textContentSource is for ReadableStream; textContent is for the plain object
    const renderTask = pdfjsLib.renderTextLayer({
      textContent:     textContent,   // ← correct param for 3.x static object
      container:       textLayer,
      viewport:        vp,
      textDivs:        [],
    });
    await renderTask.promise;
  } catch (err) {
    // Fallback: try textContentSource in case this is a newer build
    try {
      const textContent2 = await page.getTextContent();
      const renderTask2 = pdfjsLib.renderTextLayer({
        textContentSource: page.streamTextContent(),
        container:         textLayer,
        viewport:          vp,
        textDivs:          [],
      });
      await renderTask2.promise;
    } catch (_) {}
  }

  // Repaint highlights for this page
  renderPageHighlights(pageNum, hlLayer);

  // Double-tap on text layer → dictionary
  textLayer.addEventListener('dblclick', handleDblClick);
  wrap.addEventListener('dblclick', handleDblClick);

  // After text renders, wire up selection → highlight button
  textLayer.addEventListener('mouseup',  scheduleSelectionCheck);
  textLayer.addEventListener('touchend', scheduleSelectionCheck);
}

function calcViewport(page) {
  // Get real dimensions — multiple fallbacks for mobile
  let cW = pdfArea.clientWidth  || pdfScroller.clientWidth  || window.innerWidth;
  let cH = pdfArea.clientHeight || pdfScroller.clientHeight || (window.innerHeight - 120);

  // Ensure minimum sensible size
  if (cW < 50) cW = window.innerWidth;
  if (cH < 50) cH = window.innerHeight - 120;

  const pad = 20; // small padding on mobile
  const aw  = cW - pad;
  const ah  = cH - pad;

  if (S.fitMode === 'width') {
    const base  = page.getViewport({ scale: 1 });
    const scale = Math.max(0.3, aw / base.width);
    return page.getViewport({ scale });
  }
  if (S.fitMode === 'page') {
    const base = page.getViewport({ scale: 1 });
    const scale = Math.max(0.3, Math.min(aw / base.width, ah / base.height));
    return page.getViewport({ scale });
  }
  return page.getViewport({ scale: Math.max(0.3, Math.min(5, S.zoom)) });
}

function rerender() {
  if (!S.pdfDoc) return;
  pdfPages.innerHTML = '';
  S.rendered = {};
  if (S.scrollMode) {
    (async () => {
      for (let p = 1; p <= S.totalPages; p++) await renderPage(p);
      reRenderAllHighlights();
    })();
  } else {
    renderPage(S.page).then(() => {
      prefetch(S.page + 1);
      prefetch(S.page - 1);
      reRenderAllHighlights();
    });
  }
}

// Re-render on resize
let _resizeT;
window.addEventListener('resize', () => {
  clearTimeout(_resizeT);
  _resizeT = setTimeout(() => { if (S.pdfDoc) rerender(); }, 350);
});

// ═══════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════
prevPageBtn.addEventListener('click', () => goTo(S.page - 1));
nextPageBtn.addEventListener('click', () => goTo(S.page + 1));
pageInput.addEventListener('change',  () => goTo(parseInt(pageInput.value) || 1));

// Swipe left/right on PDF area — only trigger for clear horizontal swipes
// IMPORTANT: must not interfere with taps or text selection gestures
let _touchStartX = 0, _touchStartY = 0, _touchStartT = 0;

pdfArea.addEventListener('touchstart', e => {
  if (e.touches.length === 1) {
    _touchStartX = e.touches[0].clientX;
    _touchStartY = e.touches[0].clientY;
    _touchStartT = Date.now();
  }
}, { passive: true });

pdfArea.addEventListener('touchend', e => {
  if (S.scrollMode) return;
  if (e.changedTouches.length !== 1) return;

  const dx   = e.changedTouches[0].clientX - _touchStartX;
  const dy   = e.changedTouches[0].clientY - _touchStartY;
  const dt   = Date.now() - _touchStartT;
  const dist = Math.sqrt(dx*dx + dy*dy);

  // Only treat as swipe if:
  // - moved more than 60px horizontally
  // - horizontal movement > 2x vertical (clear swipe direction)
  // - gesture took < 600ms (not a long-press for selection)
  // - no text is currently selected (selection takes priority)
  const hasSel = window.getSelection && !window.getSelection().isCollapsed;
  if (hasSel) return; // user is selecting text — don't navigate

  if (dt < 600 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) {
    if (dx < 0) goTo(S.page + 1);
    else         goTo(S.page - 1);
  }
}, { passive: true });

function goTo(n) {
  if (!S.pdfDoc) return;
  n = Math.max(1, Math.min(S.totalPages, n));
  S.page = n;
  pageInput.value = n;
  updateProgress();
  loadNote(n);

  if (S.scrollMode) {
    const el = document.getElementById('pp-' + n);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    markCurrent(n);
  } else {
    pdfPages.innerHTML = '';
    S.rendered = {};
    renderPage(n).then(() => { prefetch(n+1); prefetch(n-1); });
  }

  renderStickies();
  saveMeta();
}

function markCurrent(n) {
  pdfPages.querySelectorAll('.pdf-page-wrap').forEach(w =>
    w.classList.toggle('cur-page', +w.dataset.page === n));
}

// Scroll mode page tracking
pdfScroller.addEventListener('scroll', () => {
  if (!S.scrollMode || !S.pdfDoc) return;
  const midY = pdfScroller.scrollTop + pdfScroller.clientHeight / 2;
  let best = null, bestD = Infinity;
  pdfPages.querySelectorAll('.pdf-page-wrap').forEach(w => {
    const d = Math.abs(w.offsetTop + w.offsetHeight/2 - midY);
    if (d < bestD) { bestD = d; best = w; }
  });
  if (best) {
    const p = +best.dataset.page;
    if (p !== S.page) {
      S.page = p;
      pageInput.value = p;
      updateProgress();
      loadNote(p);
      markCurrent(p);
    }
  }
}, { passive: true });

function updateProgress() {
  const pct = S.totalPages ? Math.round(S.page / S.totalPages * 100) : 0;
  progFill.style.width = pct + '%';
}

function saveMeta() {
  const meta = S.library.find(b => b.id === S.bookId);
  if (!meta) return;
  meta.lastPage = S.page;
  meta.progress = S.totalPages ? Math.round(S.page / S.totalPages * 100) : 0;
  DB.put('meta', meta).catch(() => {});
  save();
}

// ═══════════════════════════════════════════════
// ZOOM
// ═══════════════════════════════════════════════
zoomInBtn.addEventListener('click', () => {
  S.fitMode = null; updateFitUI();
  S.zoom = Math.min(5, S.zoom + 0.25);
  zoomLabel.textContent = Math.round(S.zoom * 100) + '%';
  rerender();
});
zoomOutBtn.addEventListener('click', () => {
  S.fitMode = null; updateFitUI();
  S.zoom = Math.max(0.3, S.zoom - 0.25);
  zoomLabel.textContent = Math.round(S.zoom * 100) + '%';
  rerender();
});

fitWidthBtn.addEventListener('click', () => {
  S.fitMode = S.fitMode === 'width' ? null : 'width';
  zoomLabel.textContent = S.fitMode === 'width' ? 'Auto' : Math.round(S.zoom*100)+'%';
  updateFitUI(); rerender();
});
fitPageBtn.addEventListener('click', () => {
  S.fitMode = S.fitMode === 'page' ? null : 'page';
  zoomLabel.textContent = S.fitMode === 'page' ? 'Fit' : Math.round(S.zoom*100)+'%';
  updateFitUI(); rerender();
});

function updateFitUI() {
  fitWidthBtn.classList.toggle('on', S.fitMode === 'width');
  fitPageBtn.classList.toggle('on',  S.fitMode === 'page');
}

// Pinch-to-zoom
let _pinchD = 0;
pdfScroller.addEventListener('touchstart', e => {
  if (e.touches.length === 2)
    _pinchD = Math.hypot(e.touches[0].pageX-e.touches[1].pageX, e.touches[0].pageY-e.touches[1].pageY);
}, { passive: true });
pdfScroller.addEventListener('touchmove', e => {
  if (e.touches.length !== 2 || !_pinchD) return;
  const d = Math.hypot(e.touches[0].pageX-e.touches[1].pageX, e.touches[0].pageY-e.touches[1].pageY);
  S.fitMode = null; updateFitUI();
  S.zoom = Math.max(0.3, Math.min(5, S.zoom * (d/_pinchD)));
  zoomLabel.textContent = Math.round(S.zoom*100)+'%';
  _pinchD = d;
  rerender();
}, { passive: true });

// ═══════════════════════════════════════════════
// SCROLL MODE
// ═══════════════════════════════════════════════
scrollModeBtn.addEventListener('click', () => {
  S.scrollMode = !S.scrollMode;
  scrollModeBtn.classList.toggle('on', S.scrollMode);
  rerender();
  toast(S.scrollMode ? '📜 Continuous scroll ON' : '📄 Single page mode');
});

// ═══════════════════════════════════════════════
// NOTES
// ═══════════════════════════════════════════════
function loadNote(p) {
  const text = S.notes[S.bookId]?.[p] ?? '';
  notesPgLbl.textContent = 'Notes — Page ' + p;
  notesEditor.value = text;
}

saveNoteBtn.addEventListener('click', () => doSaveNote());
notesEditor.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 's') { e.preventDefault(); doSaveNote(); }
});

function doSaveNote() {
  if (!S.bookId) return;
  if (!S.notes[S.bookId]) S.notes[S.bookId] = {};
  S.notes[S.bookId][S.page] = notesEditor.value;
  save();
  refreshAllNotes();
  noteSavedMsg.textContent = '✓ Saved';
  setTimeout(() => noteSavedMsg.textContent = '', 2000);
  toast('📝 Note saved');
}

function refreshAllNotes() {
  const ns    = S.notes[S.bookId] || {};
  const pages = Object.keys(ns).filter(p => ns[p]?.trim()).sort((a,b) => +a - +b);
  if (!pages.length) { allNotesList.innerHTML = '<p class="empty-msg">No notes yet.</p>'; return; }
  allNotesList.innerHTML = pages.map(p => `
    <div class="note-card" data-p="${p}">
      <div class="note-card-pg">Page ${p}</div>
      ${esc(ns[p].slice(0,100))}${ns[p].length>100?'…':''}
    </div>`).join('');
  allNotesList.querySelectorAll('.note-card').forEach(c =>
    c.addEventListener('click', () => { goTo(+c.dataset.p); closeSheet(); }));
}

// ═══════════════════════════════════════════════
// BOOKMARKS
// ═══════════════════════════════════════════════
addBookmarkBtn.addEventListener('click', () => {
  if (!S.pdfDoc) return;
  if (!S.bookmarks[S.bookId]) S.bookmarks[S.bookId] = [];
  if (S.bookmarks[S.bookId].includes(S.page)) { toast('Already bookmarked'); return; }
  S.bookmarks[S.bookId].push(S.page);
  S.bookmarks[S.bookId].sort((a,b) => a-b);
  save(); refreshBookmarks();
  toast('🔖 Page ' + S.page + ' bookmarked');
});

function refreshBookmarks() {
  const bms = S.bookmarks[S.bookId] || [];
  if (!bms.length) { bmList.innerHTML = '<p class="empty-msg">No bookmarks yet.</p>'; return; }
  bmList.innerHTML = bms.map(p => `
    <div class="bm-item" data-p="${p}">
      <span class="bm-pg">Page ${p}</span>
      <button class="bm-rm" data-rm="${p}">✕ Remove</button>
    </div>`).join('');
  bmList.querySelectorAll('.bm-item').forEach(item =>
    item.addEventListener('click', e => {
      if (e.target.closest('[data-rm]')) return;
      goTo(+item.dataset.p); closeSheet();
    }));
  bmList.querySelectorAll('[data-rm]').forEach(btn =>
    btn.addEventListener('click', () => {
      S.bookmarks[S.bookId] = S.bookmarks[S.bookId].filter(x => x !== +btn.dataset.rm);
      save(); refreshBookmarks();
    }));
}

// ═══════════════════════════════════════════════
// SELECTION → FLOATING HIGHLIGHT TOOLBAR
// ═══════════════════════════════════════════════

// Create floating toolbar DOM (once)
const selToolbar = document.createElement('div');
selToolbar.id        = 'selToolbar';
selToolbar.className = 'sel-toolbar hidden';
selToolbar.innerHTML = `
  <span class="sel-label">Highlight:</span>
  ${['#FFEAA7','#81ECEC','#55EFC4','#FAB1A0','#A29BFE','#FD79A8'].map(c =>
    `<button class="sel-swatch" data-col="${c}" style="background:${c}" title="${c}"></button>`
  ).join('')}
  <button class="sel-copy" title="Copy text">📋</button>
  <button class="sel-dict" title="Dictionary">📖</button>
`;
document.body.appendChild(selToolbar);

let _selCheckT;
function scheduleSelectionCheck() {
  clearTimeout(_selCheckT);
  _selCheckT = setTimeout(checkSelection, 250);
}

function checkSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString().trim()) {
    selToolbar.classList.add('hidden');
    return;
  }
  // Position toolbar above the selection
  try {
    const range = sel.getRangeAt(0);
    const rect  = range.getBoundingClientRect();
    if (!rect.width) { selToolbar.classList.add('hidden'); return; }
    const tbW = 280;
    let left  = rect.left + rect.width / 2 - tbW / 2;
    let top   = rect.top - 52 + window.scrollY;
    left = Math.max(8, Math.min(left, window.innerWidth - tbW - 8));
    top  = top < 8 ? rect.bottom + 8 : top;
    selToolbar.style.left = left + 'px';
    selToolbar.style.top  = top  + 'px';
    selToolbar.classList.remove('hidden');
  } catch (_) {}
}

// Swatch buttons in toolbar
selToolbar.querySelectorAll('.sel-swatch').forEach(btn => {
  btn.addEventListener('mousedown', e => e.preventDefault()); // keep selection alive
  btn.addEventListener('click', () => {
    S.hiliteColour = btn.dataset.col;
    // Sync sheet swatches
    swatchRow.querySelectorAll('.swatch').forEach(s =>
      s.classList.toggle('sel', s.dataset.col === S.hiliteColour));
    doHighlight();
    selToolbar.classList.add('hidden');
  });
});

// Copy button
selToolbar.querySelector('.sel-copy').addEventListener('mousedown', e => e.preventDefault());
selToolbar.querySelector('.sel-copy').addEventListener('click', () => {
  const text = window.getSelection()?.toString().trim();
  if (text) navigator.clipboard?.writeText(text).catch(() => {});
  toast('📋 Copied!');
  selToolbar.classList.add('hidden');
  window.getSelection()?.removeAllRanges();
});

// Dict button
selToolbar.querySelector('.sel-dict').addEventListener('mousedown', e => e.preventDefault());
selToolbar.querySelector('.sel-dict').addEventListener('click', () => {
  const word = window.getSelection()?.toString().trim().split(/\s+/)[0];
  if (word) { handleDblClick({ clientX: parseInt(selToolbar.style.left), clientY: parseInt(selToolbar.style.top) + 60, _word: word }); }
  selToolbar.classList.add('hidden');
});

// Hide toolbar on click outside
document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) selToolbar.classList.add('hidden');
});

// Also trigger from swipe/mouse up anywhere on pdfArea
pdfArea.addEventListener('mouseup',  scheduleSelectionCheck);
pdfArea.addEventListener('touchend', e => {
  if (e.touches.length === 0) scheduleSelectionCheck(); // only when all fingers lifted
});

// ═══════════════════════════════════════════════
// HIGHLIGHTS — save + render on page
// ═══════════════════════════════════════════════
swatchRow.querySelectorAll('.swatch').forEach(sw => {
  sw.addEventListener('click', () => {
    S.hiliteColour = sw.dataset.col;
    swatchRow.querySelectorAll('.swatch').forEach(s => s.classList.remove('sel'));
    sw.classList.add('sel');
    doHighlight();
  });
});

function doHighlight() {
  const sel  = window.getSelection();
  if (!sel || sel.isCollapsed) { toast('Select text on the PDF first'); return; }
  const text = sel.toString().trim();
  if (!text) { toast('No text selected'); return; }
  if (!S.hilites[S.bookId]) S.hilites[S.bookId] = [];
  const hlObj = { id: uid(), page: S.page, text, colour: S.hiliteColour };
  S.hilites[S.bookId].push(hlObj);
  save();
  refreshHilites();
  // Visually mark the highlight on the page
  applyHighlightToPage(hlObj);
  sel.removeAllRanges();
  toast('🖍️ Highlighted!');
}

/**
 * Walk the text layer and wrap matching text spans in a coloured highlight mark.
 */
function applyHighlightToPage(hlObj) {
  const wrap = document.getElementById('pp-' + hlObj.page);
  if (!wrap) return;
  const hlLayer = wrap.querySelector('.pdf-hl-layer');
  if (!hlLayer) return;
  const textLayer = wrap.querySelector('.pdf-text-layer');
  if (!textLayer) return;

  // Find the text in the text layer spans and paint coloured boxes
  const spans  = [...textLayer.querySelectorAll('span')];
  const target = hlObj.text.trim().toLowerCase();
  let buf = '', startIdx = -1;

  for (let i = 0; i < spans.length; i++) {
    buf += spans[i].textContent;
    if (startIdx === -1 && buf.toLowerCase().includes(target.slice(0, 10))) startIdx = i;
    if (buf.toLowerCase().replace(/\s+/g,' ').includes(target)) {
      // Highlight all spans from startIdx to i
      for (let j = Math.max(0, startIdx); j <= i; j++) {
        const r   = spans[j].getBoundingClientRect();
        const lr  = wrap.getBoundingClientRect();
        const box = document.createElement('div');
        box.className = 'hl-box';
        box.dataset.hlId = hlObj.id;
        box.style.cssText = `
          left:${r.left - lr.left}px;
          top:${r.top - lr.top}px;
          width:${r.width}px;
          height:${r.height + 2}px;
          background:${hlObj.colour};
          opacity:0.45;
        `;
        hlLayer.appendChild(box);
      }
      break;
    }
  }
}

/**
 * Render all saved highlights for a specific page (called after page renders).
 */
function renderPageHighlights(pageNum, hlLayer) {
  if (!S.bookId || !S.hilites[S.bookId]) return;
  const hs = S.hilites[S.bookId].filter(h => h.page === pageNum);
  if (!hs.length) return;
  // Wait briefly for text layer to finish painting
  setTimeout(() => hs.forEach(h => applyHighlightToPage(h)), 400);
}

/**
 * Re-render all highlights across all visible pages (e.g. after rerender).
 */
function reRenderAllHighlights() {
  pdfPages.querySelectorAll('.pdf-hl-layer').forEach(layer => {
    const p = +layer.dataset.hlPage;
    layer.innerHTML = '';
    renderPageHighlights(p, layer);
  });
}

function refreshHilites() {
  const hs = S.hilites[S.bookId] || [];
  if (!hs.length) { hiliteList.innerHTML = '<p class="empty-msg">No highlights yet.</p>'; return; }
  hiliteList.innerHTML = hs.map(h => `
    <div class="hl-item" style="border-left-color:${h.colour};background:${h.colour}22">
      <div class="hl-pg">
        <span>Page ${h.page}</span>
        <span class="hl-rm" data-rm="${h.id}">✕</span>
      </div>
      ${esc(h.text.slice(0,120))}${h.text.length>120?'…':''}
    </div>`).join('');
  hiliteList.querySelectorAll('[data-rm]').forEach(btn =>
    btn.addEventListener('click', () => {
      const id = btn.dataset.rm;
      S.hilites[S.bookId] = S.hilites[S.bookId].filter(h => h.id !== id);
      // Remove highlight boxes from DOM
      document.querySelectorAll(`[data-hl-id="${id}"]`).forEach(el => el.remove());
      save(); refreshHilites();
    }));
}

// ═══════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════
searchBtn.addEventListener('click', doSearch);
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
prevMatchBtn.addEventListener('click', () => stepSearch(-1));
nextMatchBtn.addEventListener('click', () => stepSearch(1));

async function doSearch() {
  const q = searchInput.value.trim();
  if (!q || !S.pdfDoc) { toast('Enter a search term first'); return; }
  toast('🔎 Searching…');
  S.searchHits = [];

  for (let p = 1; p <= S.totalPages; p++) {
    if (!S.textCache[S.bookId]?.[p]) {
      try {
        const pg = await S.pdfDoc.getPage(p);
        const tc = await pg.getTextContent();
        if (!S.textCache[S.bookId]) S.textCache[S.bookId] = {};
        S.textCache[S.bookId][p] = tc.items.map(i => i.str).join(' ');
      } catch (_) { continue; }
    }
    const text = S.textCache[S.bookId][p] || '';
    const re   = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi');
    let m;
    while ((m = re.exec(text)) !== null)
      S.searchHits.push({ page: p, snippet: text.slice(Math.max(0,m.index-50), m.index+q.length+50) });
  }

  S.searchIdx = 0;
  renderSearchResults(q);
  updateMatchLabel();
  if (S.searchHits.length) stepSearch(0);
  else toast('No matches found');
}

function renderSearchResults(q) {
  if (!S.searchHits.length) { searchResults.innerHTML = '<p class="empty-msg">No results.</p>'; return; }
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi');
  searchResults.innerHTML = S.searchHits.slice(0,80).map((h,i) => {
    const marked = h.snippet.replace(re, m => `\x00${m}\x01`);
    const safe   = esc(marked).replace(/\x00([^\x01]*)\x01/g,'<mark>$1</mark>');
    return `<div class="sr-item" data-i="${i}">
      <span class="sr-pg">p.${h.page}</span> — ${safe}
    </div>`;
  }).join('');
  searchResults.querySelectorAll('.sr-item').forEach(item =>
    item.addEventListener('click', () => {
      S.searchIdx = +item.dataset.i;
      stepSearch(0);
      closeSheet();
    }));
}

function stepSearch(dir) {
  if (!S.searchHits.length) return;
  if (dir !== 0) S.searchIdx = (S.searchIdx + dir + S.searchHits.length) % S.searchHits.length;
  goTo(S.searchHits[S.searchIdx].page);
  updateMatchLabel();
}

function updateMatchLabel() {
  matchLabel.textContent = S.searchHits.length
    ? `${S.searchIdx+1} / ${S.searchHits.length}` : '0 / 0';
}

// ═══════════════════════════════════════════════
// DICTIONARY
// ═══════════════════════════════════════════════
function handleDblClick(e) {
  const sel  = window.getSelection();
  const word = (e._word) || (sel && !sel.isCollapsed ? sel.toString().trim().split(/\s+/)[0].replace(/[^a-zA-Z'-]/g,'') : null);
  if (!word) return;
  if (!word || word.length < 2) return;

  // Show in word popup
  wpWord.textContent = word;
  wpPhon.textContent = wpPos.textContent = '';
  wpDef.textContent  = 'Looking up…';
  wordPopup.classList.remove('hidden');
  wordPopup.style.left = Math.min(e.clientX + 10, window.innerWidth  - 290) + 'px';
  wordPopup.style.top  = Math.min(e.clientY + 10, window.innerHeight - 200) + 'px';

  // Also update dict box in tools sheet
  dictBox.innerHTML = `<div class="dict-wd">${esc(word)}</div><div>Looking up…</div>`;

  fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(data => {
      const m0   = data[0]?.meanings?.[0];
      const def  = m0?.definitions?.[0]?.definition || 'No definition found.';
      const pos  = m0?.partOfSpeech || '';
      const phon = data[0]?.phonetic || '';
      wpPhon.textContent = phon;
      wpPos.textContent  = pos ? `[${pos}]` : '';
      wpDef.textContent  = def;
      dictBox.innerHTML  = `<div class="dict-wd">${esc(word)}</div>
        <div class="dict-ph">${esc(phon)}</div>
        <div class="dict-ps">${esc(pos)}</div>
        <div>${esc(def)}</div>`;
    })
    .catch(() => {
      wpDef.textContent = 'Not available offline.';
      dictBox.innerHTML = `<div class="dict-wd">${esc(word)}</div><div>Not available.</div>`;
    });
}

wpClose.addEventListener('click', () => wordPopup.classList.add('hidden'));

// ═══════════════════════════════════════════════
// TEXT-TO-SPEECH
// ═══════════════════════════════════════════════
function stopTTS() {
  speechSynthesis.cancel();
  S.ttsOn = false;
  ttsBtn.classList.remove('on');
  ttsBar.classList.add('hidden');
}

ttsBtn.addEventListener('click', () => {
  if (S.ttsOn) { stopTTS(); return; }
  const text = S.textCache[S.bookId]?.[S.page];
  if (!text) { toast('No readable text on this page'); return; }
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate  = 0.92;
  utt.onend = stopTTS;
  speechSynthesis.speak(utt);
  S.ttsOn = true;
  ttsBtn.classList.add('on');
  ttsLabel.textContent = 'Reading page ' + S.page + '…';
  ttsBar.classList.remove('hidden');
  closeSheet();
  toast('🔊 Reading page ' + S.page);
});

ttsStopBtn.addEventListener('click', stopTTS);

// ═══════════════════════════════════════════════
// DRAW MODE
// ═══════════════════════════════════════════════
drawColourPkr.addEventListener('input', () => {
  S.drawColour = drawColourPkr.value;
  if (S.drawCtx) S.drawCtx.strokeStyle = S.drawColour;
});

drawBtn.addEventListener('click', () => {
  S.drawMode = !S.drawMode;
  drawBtn.classList.toggle('on', S.drawMode);
  if (S.drawMode) {
    drawCanvas.width  = pdfArea.clientWidth;
    drawCanvas.height = pdfArea.clientHeight;
    drawCanvas.classList.remove('hidden');
    drawCanvas.classList.add('active');
    S.drawCtx = drawCanvas.getContext('2d');
    S.drawCtx.strokeStyle = S.drawColour;
    S.drawCtx.lineWidth   = 3;
    S.drawCtx.lineCap = S.drawCtx.lineJoin = 'round';
    closeSheet();
    toast('✏️ Draw mode ON — tap again to exit');
  } else {
    drawCanvas.classList.add('hidden');
    drawCanvas.classList.remove('active');
  }
});

drawCanvas.addEventListener('mousedown', e => {
  if (!S.drawMode) return;
  S.drawing = true;
  const r = drawCanvas.getBoundingClientRect();
  S.drawCtx.beginPath();
  S.drawCtx.moveTo(e.clientX - r.left, e.clientY - r.top);
});
drawCanvas.addEventListener('mousemove', e => {
  if (!S.drawing) return;
  const r = drawCanvas.getBoundingClientRect();
  S.drawCtx.lineTo(e.clientX - r.left, e.clientY - r.top);
  S.drawCtx.stroke();
});
['mouseup','mouseleave'].forEach(ev => drawCanvas.addEventListener(ev, () => S.drawing = false));

// Touch draw
drawCanvas.addEventListener('touchstart', e => {
  if (!S.drawMode) return;
  e.preventDefault();
  const r = drawCanvas.getBoundingClientRect();
  S.drawing = true;
  S.drawCtx.beginPath();
  S.drawCtx.moveTo(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top);
}, { passive: false });
drawCanvas.addEventListener('touchmove', e => {
  if (!S.drawing) return;
  e.preventDefault();
  const r = drawCanvas.getBoundingClientRect();
  S.drawCtx.lineTo(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top);
  S.drawCtx.stroke();
}, { passive: false });
drawCanvas.addEventListener('touchend', () => S.drawing = false);

// ═══════════════════════════════════════════════
// STICKY NOTES
// ═══════════════════════════════════════════════
addStickyBtn.addEventListener('click', () => { placeSticky(60, 80); closeSheet(); });

function placeSticky(x, y) {
  if (!S.bookId) return;
  const s = { id: uid(), page: S.page, x, y, w: 180, h: 120, text: '' };
  if (!S.stickies[S.bookId]) S.stickies[S.bookId] = [];
  S.stickies[S.bookId].push(s);
  save(); buildSticky(s);
  toast('🗒️ Sticky note added');
}

function renderStickies() {
  stickyLayer.innerHTML = '';
  (S.stickies[S.bookId] || [])
    .filter(s => S.scrollMode || s.page === S.page)
    .forEach(buildSticky);
}

function buildSticky(s) {
  const el = document.createElement('div');
  el.className = 'sticky-note';
  el.style.cssText = `left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px`;
  el.innerHTML = `
    <div class="sticky-hd">
      <small>p.${s.page}</small>
      <span class="sticky-del">✕</span>
    </div>
    <textarea class="sticky-ta" placeholder="Note…">${esc(s.text)}</textarea>`;
  stickyLayer.appendChild(el);
  stickyLayer.style.pointerEvents = 'none';
  el.style.pointerEvents = 'all';

  el.querySelector('.sticky-ta').addEventListener('input', e => { s.text = e.target.value; save(); });
  el.querySelector('.sticky-del').addEventListener('click', () => {
    S.stickies[S.bookId] = S.stickies[S.bookId].filter(x => x.id !== s.id);
    save(); el.remove();
  });

  // Touch drag
  let dragging = false, ox = 0, oy = 0;
  const hd = el.querySelector('.sticky-hd');
  hd.addEventListener('touchstart', e => {
    dragging = true;
    ox = e.touches[0].clientX - s.x;
    oy = e.touches[0].clientY - s.y;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!dragging) return;
    s.x = e.touches[0].clientX - ox;
    s.y = e.touches[0].clientY - oy;
    el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
  }, { passive: true });
  document.addEventListener('touchend', () => { if (dragging) { dragging = false; save(); } });

  // Mouse drag
  hd.addEventListener('mousedown', e => {
    dragging = true; ox = e.clientX - s.x; oy = e.clientY - s.y; e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    s.x = e.clientX - ox; s.y = e.clientY - oy;
    el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
  });
  document.addEventListener('mouseup', () => { if (dragging) { dragging = false; save(); } });
}

// ═══════════════════════════════════════════════
// FOCUS MODE
// ═══════════════════════════════════════════════
focusBtn.addEventListener('click', toggleFocus);

function toggleFocus() {
  S.focusMode = !S.focusMode;
  document.body.classList.toggle('focus-mode', S.focusMode);
  focusBtn.classList.toggle('on', S.focusMode);
  if (S.focusMode) closeSheet();
  toast(S.focusMode ? '🎯 Focus mode — tap screen edges to exit' : 'Focus mode OFF');
}

// Tap edges to exit focus mode
pdfArea.addEventListener('click', e => {
  if (!S.focusMode) return;
  const edge = 40;
  if (e.clientX < edge || e.clientX > window.innerWidth - edge) toggleFocus();
});

// ═══════════════════════════════════════════════
// STUDY MODE
// ═══════════════════════════════════════════════
studyModeBtn.addEventListener('click', () => {
  const hs = S.hilites[S.bookId] || [];
  if (!hs.length) { toast('Add some highlights first'); return; }
  const ov = document.createElement('div');
  ov.className = 'study-overlay';
  ov.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
      <h2>📖 Study Mode</h2>
      <button class="btn-primary" id="_studyClose">✕ Close</button>
    </div>
    ${hs.map(h=>`
      <div class="study-hl" style="border-left-color:${h.colour};background:${h.colour}28">
        <div class="study-hl-pg">Page ${h.page}</div>${esc(h.text)}
      </div>`).join('')}`;
  document.body.appendChild(ov);
  ov.querySelector('#_studyClose').addEventListener('click', () => ov.remove());
  closeSheet();
});

genSummaryBtn.addEventListener('click', () => {
  const hs    = S.hilites[S.bookId] || {};
  const notes = S.notes[S.bookId]   || {};
  const hArr  = Array.isArray(hs) ? hs : [];
  if (!hArr.length && !Object.values(notes).some(v=>v?.trim())) {
    summaryBox.textContent = 'No highlights or notes to summarise yet.'; return;
  }
  let out = '';
  if (hArr.length) {
    out += `HIGHLIGHTS (${hArr.length}):\n`;
    hArr.forEach(h => { out += `• [p.${h.page}] ${h.text.slice(0,80)}\n`; });
  }
  const pg = Object.keys(notes).filter(p=>notes[p]?.trim()).sort((a,b)=>+a-+b);
  if (pg.length) {
    out += `\nNOTES:\n`;
    pg.forEach(p => { out += `• [p.${p}] ${notes[p].slice(0,80)}\n`; });
  }
  summaryBox.textContent = out || 'Nothing to summarise yet.';
});

// ═══════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════
exportTxtBtn.addEventListener('click', () => doExport('txt'));
exportMdBtn.addEventListener('click',  () => doExport('md'));
exportPdfBtn.addEventListener('click', () => doExport('pdf'));

function doExport(fmt) {
  const meta  = S.library.find(b => b.id === S.bookId);
  const title = meta?.name || 'Book';
  const notes = S.notes[S.bookId]    || {};
  const hsRaw = S.hilites[S.bookId]  || [];
  const hs    = Array.isArray(hsRaw) ? hsRaw : [];
  const bms   = S.bookmarks[S.bookId] || [];
  const date  = new Date().toLocaleDateString();

  let content = '';
  if (fmt === 'md') {
    content = `# ${title}\n_${date}_\n\n`;
    if (bms.length) content += `## 🔖 Bookmarks\n${bms.map(p=>`- Page ${p}`).join('\n')}\n\n`;
    if (hs.length)  { content += `## 🖍️ Highlights\n`; hs.forEach(h => content += `### Page ${h.page}\n> ${h.text}\n\n`); }
    const pg = Object.keys(notes).filter(p=>notes[p]?.trim()).sort((a,b)=>+a-+b);
    if (pg.length)  { content += `## 📝 Notes\n`; pg.forEach(p => content += `### Page ${p}\n${notes[p]}\n\n`); }
  } else {
    content = `${title}\n${date}\n${'─'.repeat(40)}\n\n`;
    if (bms.length) content += `BOOKMARKS:\n${bms.map(p=>`  p.${p}`).join('\n')}\n\n`;
    if (hs.length)  { content += `HIGHLIGHTS:\n`; hs.forEach(h => content += `  [p.${h.page}] ${h.text}\n`); content += '\n'; }
    const pg = Object.keys(notes).filter(p=>notes[p]?.trim()).sort((a,b)=>+a-+b);
    if (pg.length)  { content += `NOTES:\n`; pg.forEach(p => content += `  [p.${p}]\n  ${notes[p]}\n\n`); }
  }

  if (fmt === 'pdf') { window.print(); return; }

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `${title}.${fmt}`
  }).click();
  toast(`✅ Exported as .${fmt}`);
  closeSheet();
}

// ═══════════════════════════════════════════════
// PASSWORD LOCK
// ═══════════════════════════════════════════════
lockBtn.addEventListener('click', () => {
  if (S.password) {
    if (window.confirm('Remove password lock?')) { S.password = null; save(); toast('🔓 Lock removed'); }
  } else {
    showLock('set');
  }
});

function showLock(mode) {
  lockModalTitle.textContent = mode === 'set' ? '🔐 Set a Password' : '🔐 Enter Password';
  lockInput.value = '';
  lockModal.classList.remove('hidden');
  lockModal.dataset.mode = mode;
  setTimeout(() => lockInput.focus(), 80);
}

lockConfirm.addEventListener('click', () => {
  const pw   = lockInput.value.trim();
  const mode = lockModal.dataset.mode;
  if (!pw) { toast('Please enter a password'); return; }
  if (mode === 'set') {
    S.password = pw; save();
    lockModal.classList.add('hidden');
    toast('🔐 Password set!');
  } else {
    if (pw !== S.password) { toast('❌ Wrong password'); lockInput.value = ''; return; }
    lockModal.classList.add('hidden');
    if (S.pendingId) {
      const id = S.pendingId; S.pendingId = null;
      const pwd = S.password; S.password = null;
      openBook(id).then(() => { S.password = pwd; });
    }
  }
});
lockCancel.addEventListener('click', () => lockModal.classList.add('hidden'));
lockInput.addEventListener('keydown', e => { if (e.key === 'Enter') lockConfirm.click(); });

// ═══════════════════════════════════════════════
// BACK TO LIBRARY
// ═══════════════════════════════════════════════
backToLib.addEventListener('click', () => {
  stopTTS();
  closeSheet();
  S.pdfDoc = null; S.bookId = null; S.sessionStart = null;
  pdfPages.innerHTML = ''; stickyLayer.innerHTML = '';
  drawCanvas.classList.add('hidden');
  drawCanvas.classList.remove('active');
  if (S.focusMode) { S.focusMode = false; document.body.classList.remove('focus-mode'); }
  showScreen('landing');
  renderLibrary();
  updateStats();
});

// ═══════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (!S.pdfDoc) return;
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  switch (e.key) {
    case 'ArrowRight': case 'ArrowDown': e.preventDefault(); goTo(S.page+1); break;
    case 'ArrowLeft':  case 'ArrowUp':   e.preventDefault(); goTo(S.page-1); break;
    case 'f': case 'F': toggleFocus(); break;
    case 'Escape':
      closeSheet();
      wordPopup.classList.add('hidden');
      lockModal.classList.add('hidden');
      document.querySelectorAll('.study-overlay').forEach(o=>o.remove());
      if (S.focusMode) toggleFocus();
      break;
  }
});

// ═══════════════════════════════════════════════
// SERVICE WORKER
// ═══════════════════════════════════════════════
if ('serviceWorker' in navigator)
  navigator.serviceWorker.register('sw.js').catch(() => {});

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
async function init() {
  load();
  applyTheme();

  // Default fit mode
  S.fitMode = 'width';
  updateFitUI();
  zoomLabel.textContent = 'Auto';

  await DB.open();
  await loadLibrary();
  showScreen('landing');
  updateStats();

  setInterval(updateStats, 60000);

  console.log('%c⚡ LumiRead — Level up brothers ⚡', 'color:#39FF14;font-weight:bold;font-size:16px');
}

init();

// Save + pause TTS when user switches away (mobile multitasking)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (S.ttsOn) stopTTS();
    if (S.bookId) saveMeta();
    save();
  }
});

// Save on page unload (refresh, close)
window.addEventListener('beforeunload', () => {
  if (S.bookId) saveMeta();
  save();
});
