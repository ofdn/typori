'use strict';
/* Typori v2 — app.js */

// ── Utilities ─────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 9); }
function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }
function splitTokens(raw) {
  return (raw||'').split(/[\s,\n]+/).map(t=>t.trim()).filter(Boolean);
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function downloadFile(content, name, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function showToast(msg, isError = false) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:8px 18px;border-radius:6px;font-size:13px;font-family:system-ui;font-weight:500;z-index:9999;pointer-events:none;transition:opacity 0.3s;box-shadow:0 4px 16px rgba(0,0,0,.2)';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = isError ? '#cc3300' : '#111';
  t.style.color = '#fff';
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2800);
}

// ── Block type defaults ───────────────────────────────────
const TYPE_DEFAULTS = {
  glyph:           { fontSize: 120, lineHeight: 1.1, textAlign: 'center' },
  h1:              { fontSize: 52,  lineHeight: 1.1, textAlign: 'left' },
  h2:              { fontSize: 32,  lineHeight: 1.2, textAlign: 'left' },
  sentence:        { fontSize: 24,  lineHeight: 1.35, textAlign: 'left' },
  word:            { fontSize: 24,  lineHeight: 1.3,  textAlign: 'left' },
  syllable:        { fontSize: 28,  lineHeight: 1.2,  textAlign: 'center' },
  paragraph:       { fontSize: 16,  lineHeight: 1.65, textAlign: 'left' },
  'survey-question': { fontSize: 14, lineHeight: 1.5, textAlign: 'left' },
};

// ── Factories ────────────────────────────────────────────
function makePage(name = 'Page 1') { return { id: uid(), name, blocks: [] }; }
function makeGridPage(name = 'Grid 1') {
  return { id: uid(), name, blocks: [],
    settings: { consonantsRaw: '', vowelData: [], fontSize: 28, conjunctsRaw: '' } };
}
function makeBlock(ov = {}) {
  const type = ov.type || 'paragraph';
  const def = TYPE_DEFAULTS[type] || TYPE_DEFAULTS.paragraph;
  return {
    id: uid(), type,
    text: '',
    fontId: null,
    fontSize: def.fontSize,
    lineHeight: def.lineHeight,
    letterSpacing: 0,
    color: '#111111',
    backgroundColor: 'transparent',
    textAlign: def.textAlign,
    label: '',
    colSpan: 2,          // 1 = half width, 2 = full width
    padding: 0,          // px
    borderWidth: 0,      // px
    borderColor: '#111111',
    bgImage: null,       // data URL
    questionResponse: '', // for survey-question type
    ...ov,
  };
}

// ── State ─────────────────────────────────────────────────
const state = {
  mode: 'paragraph',
  fonts: [],
  systemFonts: [],

  paragraphPages: [makePage('Page 1')],
  paragraphPageIdx: 0,

  gridPages: [makeGridPage('Grid 1')],
  gridPageIdx: 0,

  deviceFrame: 'phone',
  selectedBlockId: null,
  globalSettings: { bodyFontSize: 16, bodyLineHeight: 1.65 },
  survey: { questions: [], responses: {} },

  fileHandle: null,
  isDirty: false,
  reviewMode: false,
};

// ── State helpers ────────────────────────────────────────
function getPages() {
  return state.mode === 'syllabic-grid' ? state.gridPages : state.paragraphPages;
}
function getPageIdx() {
  return state.mode === 'syllabic-grid' ? state.gridPageIdx : state.paragraphPageIdx;
}
function setPageIdx(i) {
  if (state.mode === 'syllabic-grid') state.gridPageIdx = i;
  else state.paragraphPageIdx = i;
}
function getPage() {
  const pages = getPages(), i = getPageIdx();
  return pages[Math.min(i, pages.length - 1)] || pages[0];
}
function getBlocks() { return getPage().blocks; }
function getGridSettings() { return getPage().settings || state.gridPages[0].settings; }

// ── Font management ──────────────────────────────────────
const SYSTEM_FONT_CANDIDATES = [
  'Arial','Arial Black','Comic Sans MS','Courier New','Georgia','Impact',
  'Times New Roman','Trebuchet MS','Verdana','Helvetica Neue','Helvetica',
  'Gill Sans','Futura','Garamond','Palatino','Book Antiqua','Optima',
  'Baskerville','Didot','Bodoni MT','Rockwell','Lucida Grande',
  'Lucida Console','Tahoma','Century Gothic','Cambria','Calibri',
  'Segoe UI','Roboto','Open Sans','Lato','Montserrat','Source Sans Pro',
  'Noto Sans','Noto Serif','Kohinoor Devanagari','Noto Sans Oriya',
  'Noto Serif Devanagari','Kohinoor Bangla','Mukta',
];

async function loadFontFile(file) {
  try {
    const buf = await file.arrayBuffer();
    const base = file.name.replace(/\.[^.]+$/, '');
    const family = 'typori-' + base.toLowerCase().replace(/[^a-z0-9]/g, '-');

    let meta = { name: base, subFamily: '', version: '', chars: 0, glyphs: 0, features: [] };
    if (window.opentype) {
      try {
        const font = opentype.parse(buf);
        const n = font.names;
        const gn = s => (s ? (s.en || Object.values(s)[0] || '') : '');
        meta.name = gn(n.fullName) || gn(n.fontFamily) || base;
        meta.subFamily = gn(n.fontSubfamily) || '';
        meta.version = gn(n.version) || '';
        meta.glyphs = font.glyphs.length;
        const cmap = font.tables.cmap;
        meta.chars = cmap ? Object.keys(cmap.glyphIndexMap || {}).length : 0;
        const feats = new Set();
        const gsub = font.tables.gsub;
        if (gsub?.featureList?.featureRecords) {
          gsub.featureList.featureRecords.forEach(r => feats.add(r.featureTag));
        }
        meta.features = [...feats].filter(t => /^[a-z]{4}$/.test(t)).slice(0, 20);
      } catch (e) {}
    }

    const blob = new Blob([buf]);
    const url = URL.createObjectURL(blob);
    const ff = new FontFace(family, `url(${url})`);
    await ff.load();
    document.fonts.add(ff);

    const existing = state.fonts.findIndex(f => f.family === family);
    const entry = {
      id: existing >= 0 ? state.fonts[existing].id : uid(),
      family, size: Math.round(buf.byteLength / 1024) + 'KB',
      name: meta.name, subFamily: meta.subFamily,
      version: meta.version, chars: meta.chars, glyphs: meta.glyphs,
      features: meta.features, featureSettings: {},
    };
    if (existing >= 0) state.fonts[existing] = entry;
    else state.fonts.unshift(entry);

    // Auto-apply to blocks that have no font
    getBlocks().forEach(b => { if (!b.fontId) b.fontId = entry.id; });

    state.isDirty = true;
    renderFontPanel();
    populateFontSelect();
    renderSpecimen();
    showToast(`Loaded: ${entry.name}`);
  } catch (e) { showToast('Font load failed: ' + e.message, true); }
}

function removeFont(id) {
  state.fonts = state.fonts.filter(f => f.id !== id);
  getBlocks().forEach(b => { if (b.fontId === id) b.fontId = null; });
  state.isDirty = true;
  renderFontPanel(); populateFontSelect(); renderSpecimen();
}

function getFontFamily(fontId) {
  const sys = ', system-ui, -apple-system, Arial, sans-serif';
  if (!fontId) return `system-ui, -apple-system, sans-serif`;
  const c = state.fonts.find(f => f.id === fontId);
  if (c) return `'${c.family}'${sys}`;
  if (fontId.startsWith('sys:')) return `'${fontId.slice(4)}'${sys}`;
  return `system-ui, -apple-system, sans-serif`;
}

function getFontFeatureCSS(fontId) {
  const c = state.fonts.find(f => f.id === fontId);
  if (!c || !Object.keys(c.featureSettings).length) return '';
  return Object.entries(c.featureSettings)
    .map(([k, v]) => `"${k}" ${v}`).join(', ');
}

function getDisplayName(fontId) {
  if (!fontId) return 'System';
  const c = state.fonts.find(f => f.id === fontId);
  if (c) return c.name;
  if (fontId.startsWith('sys:')) return fontId.slice(4);
  return fontId;
}

function renderFontPanel() {
  const el = document.getElementById('font-list');
  if (!el) return;

  let html = '';
  if (state.fonts.length) {
    html += '<div class="font-group-label">Loaded Fonts</div>';
    html += state.fonts.map(f => `
      <div class="font-item" data-font-id="${f.id}">
        <div class="font-item-body">
          <div class="font-item-name" style="font-family:'${f.family}',system-ui">${esc(f.name)}${f.subFamily ? ` <span class="font-sub">${esc(f.subFamily)}</span>` : ''}</div>
          <div class="font-item-meta">${f.chars ? f.chars + ' chars · ' : ''}${f.glyphs} glyphs · ${f.size}${f.version ? ' · v' + esc(f.version) : ''}</div>
          ${f.features.length ? `<div class="font-feats">${f.features.map(tag => {
            const st = f.featureSettings[tag];
            const cls = st === 1 ? ' feat-on' : st === 0 ? ' feat-off' : '';
            return `<button class="feat-tag${cls}" data-font-id="${f.id}" data-feat="${tag}">${tag}</button>`;
          }).join('')}</div>` : ''}
        </div>
        <button class="font-item-remove" data-remove-font="${f.id}" title="Remove">✕</button>
      </div>`).join('');
  }

  if (state.systemFonts.length) {
    html += `<div class="font-group-label" style="margin-top:8px">System Fonts <span class="font-count">${state.systemFonts.length}</span></div>`;
    html += `<select class="ctrl-select" id="sys-font-select" style="margin-bottom:4px">
      <option value="">— pick a system font —</option>
      ${state.systemFonts.map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}
    </select>`;
    html += `<button class="ctrl-btn full" id="btn-apply-sys-font">Apply to selected block</button>`;
  } else {
    html += `<div class="font-empty" style="margin-top:8px">Scanning system fonts…</div>`;
  }

  el.innerHTML = html;

  // System font select handler
  document.getElementById('btn-apply-sys-font')?.addEventListener('click', () => {
    const sel = document.getElementById('sys-font-select');
    if (!sel?.value) return;
    if (!state.systemFonts.find(f => f.id === sel.value)) return;
    if (state.selectedBlockId) {
      updateBlock(state.selectedBlockId, { fontId: sel.value });
      refreshBlockEl(state.selectedBlockId);
      updateControls();
    } else {
      showToast('Select a block first', true);
    }
  });
}

function populateFontSelect() {
  const sel = document.getElementById('ctrl-font');
  if (!sel) return;
  const cur = sel.value;
  let html = '<option value="">— system / inherit —</option>';
  if (state.fonts.length) {
    html += '<optgroup label="Loaded Fonts">';
    html += state.fonts.map(f => `<option value="${f.id}">${esc(f.name)}${f.subFamily ? ' ' + esc(f.subFamily) : ''}</option>`).join('');
    html += '</optgroup>';
  }
  if (state.systemFonts.length) {
    html += '<optgroup label="System Fonts">';
    html += state.systemFonts.map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');
    html += '</optgroup>';
  }
  sel.innerHTML = html;
  if (cur) sel.value = cur;
}

async function loadSystemFonts() {
  let families = [];
  if ('queryLocalFonts' in window) {
    try {
      const lf = await window.queryLocalFonts();
      families = [...new Set(lf.map(f => f.family))].sort();
    } catch (e) {}
  }
  if (!families.length) {
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    const test = 'mmmmmmmmmmlli';
    ctx.font = '72px monospace';
    const base = ctx.measureText(test).width;
    SYSTEM_FONT_CANDIDATES.forEach(font => {
      ctx.font = `72px '${font}', monospace`;
      if (ctx.measureText(test).width !== base) families.push(font);
    });
  }
  state.systemFonts = families.map(f => ({ id: `sys:${f}`, name: f }));
  renderFontPanel();
  populateFontSelect();
}

// ── Block style ──────────────────────────────────────────
function applyStyle(el, block) {
  if (!el) return;
  el.style.fontFamily = getFontFamily(block.fontId);
  el.style.fontSize = block.fontSize + 'px';
  el.style.lineHeight = block.lineHeight;
  el.style.letterSpacing = block.letterSpacing + 'px';
  el.style.wordSpacing = 'normal';
  el.style.color = block.color || '#111111';
  el.style.textAlign = block.textAlign;
  const ffs = getFontFeatureCSS(block.fontId);
  el.style.fontFeatureSettings = ffs || '';
}

function applyBlockWrapStyle(el, block) {
  // Background (color or image)
  const bg = block.backgroundColor;
  const hasBg = bg && bg !== 'transparent';
  if (block.bgImage) {
    el.style.backgroundImage = `url(${block.bgImage})`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
  } else {
    el.style.backgroundImage = '';
    el.style.backgroundColor = hasBg ? bg : '';
  }
  // Padding — only override when explicitly set; let CSS .block handle default layout spacing
  el.style.padding = block.padding > 0 ? block.padding + 'px' : '';
  // Border
  if (block.borderWidth > 0) {
    el.style.border = `${block.borderWidth}px solid ${block.borderColor || '#111'}`;
  } else {
    el.style.border = '';
  }
  // Column span class
  el.classList.toggle('col-1', block.colSpan === 1);
  el.classList.toggle('col-2', block.colSpan !== 1);
}

function refreshBlockEl(id) {
  const block = getBlocks().find(b => b.id === id);
  if (!block) return;
  const el = document.querySelector(`[data-block-id="${id}"]`);
  if (!el) return;
  const c = el.querySelector('.block-content,.grid-cell-content');
  if (c) applyStyle(c, block);
  applyBlockWrapStyle(el, block);
  const lbl = el.querySelector('.block-label-tag');
  if (lbl) { lbl.textContent = block.label || ''; lbl.style.display = block.label ? '' : 'none'; }
}

// ── Block operations ─────────────────────────────────────
function selectBlock(id) {
  state.selectedBlockId = id;
  document.querySelectorAll('[data-block-id]').forEach(el => el.classList.toggle('selected', el.dataset.blockId === id));
  updateControls();
}
function deselectAll() {
  state.selectedBlockId = null;
  document.querySelectorAll('[data-block-id]').forEach(el => el.classList.remove('selected'));
  updateControls();
}
function addBlock(ov = {}) {
  const fontId = state.fonts[0]?.id || null;
  const b = makeBlock({ fontId, ...ov });
  getBlocks().push(b);
  state.isDirty = true;
  renderSpecimen();
  selectBlock(b.id);
  // Scroll new block into view
  setTimeout(() => {
    const el = document.querySelector(`[data-block-id="${b.id}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 50);
  return b;
}
function deleteBlock(id) {
  const blocks = getBlocks();
  const i = blocks.findIndex(b => b.id === id);
  if (i === -1) return;
  blocks.splice(i, 1);
  if (state.selectedBlockId === id) state.selectedBlockId = null;
  state.isDirty = true;
  renderSpecimen(); updateControls();
}
function duplicateBlock(id) {
  const blocks = getBlocks();
  const src = blocks.find(b => b.id === id);
  if (!src) return;
  const copy = { ...src, id: uid() };
  blocks.splice(blocks.indexOf(src) + 1, 0, copy);
  state.isDirty = true;
  renderSpecimen(); selectBlock(copy.id);
}
function moveBlockUp(id) {
  const blocks = getBlocks();
  const i = blocks.findIndex(b => b.id === id);
  if (i <= 0) return;
  [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]];
  state.isDirty = true;
  renderSpecimen(); selectBlock(id);
}
function moveBlockDown(id) {
  const blocks = getBlocks();
  const i = blocks.findIndex(b => b.id === id);
  if (i < 0 || i >= blocks.length - 1) return;
  [blocks[i], blocks[i + 1]] = [blocks[i + 1], blocks[i]];
  state.isDirty = true;
  renderSpecimen(); selectBlock(id);
}
function updateBlock(id, updates) {
  const b = getBlocks().find(b => b.id === id);
  if (b) { Object.assign(b, updates); state.isDirty = true; }
}

// ── Page management ──────────────────────────────────────
function addPage() {
  const pages = getPages();
  const n = pages.length + 1;
  const name = (state.mode === 'syllabic-grid' ? 'Grid ' : 'Page ') + n;
  pages.push(state.mode === 'syllabic-grid' ? makeGridPage(name) : makePage(name));
  setPageIdx(pages.length - 1);
  state.selectedBlockId = null;
  renderPageTabs(); renderSpecimen(); updateControls();
}
function deletePage(i) {
  const pages = getPages();
  if (pages.length <= 1) { showToast('Cannot delete the only page', true); return; }
  pages.splice(i, 1);
  setPageIdx(Math.min(getPageIdx(), pages.length - 1));
  state.selectedBlockId = null;
  renderPageTabs(); renderSpecimen(); updateControls();
}
function switchPage(i) {
  setPageIdx(i);
  state.selectedBlockId = null;
  renderPageTabs(); renderSpecimen(); updateControls();
  if (state.mode === 'syllabic-grid') syncGridUI();
}
function renderPageTabs() {
  const nav = document.getElementById('page-nav');
  if (!nav) return;
  const pages = getPages(), cur = getPageIdx();
  nav.innerHTML = pages.map((p, i) => `
    <div class="page-tab${i === cur ? ' active' : ''}" data-page-idx="${i}" title="${esc(p.name)}">
      <span class="page-tab-name">${esc(p.name)}</span>
      ${pages.length > 1 ? `<button class="page-tab-close" data-close-page="${i}" title="Delete page">✕</button>` : ''}
    </div>
  `).join('') + `<button class="page-tab-add" id="btn-add-page" title="Add page">+</button>`;
}

// ── Rendering ─────────────────────────────────────────────
function renderSpecimen() {
  const m = state.mode;
  if (m === 'paragraph') renderParagraph();
  else if (m === 'syllabic-grid') renderGrid();
  else renderDevice();
}

// ── Paragraph mode ───────────────────────────────────────
let _sortable;
function renderParagraph() {
  const canvas = document.getElementById('specimen-canvas');
  canvas.className = 'specimen-canvas';
  canvas.removeAttribute('style');
  const blocks = getBlocks();

  if (!blocks.length) {
    canvas.innerHTML = `
      <div class="canvas-empty">
        <div class="canvas-empty-icon">Aa</div>
        <h3>Empty page</h3>
        <p>Click <strong>+ Block</strong> to start adding content.</p>
      </div>
      <div class="add-block-placeholder" id="inline-add">+ Add block</div>`;
    document.getElementById('inline-add')?.addEventListener('click', () => addBlock());
    return;
  }

  canvas.innerHTML = '';
  // Use grid if any block has colSpan=1
  const needsGrid = blocks.some(b => b.colSpan === 1);
  if (needsGrid) canvas.classList.add('two-col');

  const frag = document.createDocumentFragment();
  blocks.forEach(b => frag.appendChild(mkBlockEl(b)));

  const ph = document.createElement('div');
  ph.className = 'add-block-placeholder';
  if (needsGrid) ph.style.gridColumn = '1 / -1';
  ph.textContent = '+ Add block';
  ph.addEventListener('click', () => addBlock());
  frag.appendChild(ph);
  canvas.appendChild(frag);
  initSortable(canvas);
}

function mkBlockEl(block) {
  const el = document.createElement('div');
  el.className = 'block' + (block.id === state.selectedBlockId ? ' selected' : '');
  el.dataset.blockId = block.id;
  el.dataset.type = block.type;
  applyBlockWrapStyle(el, block);

  const dragHandle = document.createElement('div');
  dragHandle.className = 'block-drag-handle';
  dragHandle.innerHTML = '<span></span><span></span><span></span><span></span><span></span><span></span>';

  if (block.type === 'survey-question') {
    // Survey question: editable question text + response textarea
    const inner = document.createElement('div');
    inner.className = 'sq-inner';

    const qLabel = document.createElement('div');
    qLabel.className = 'sq-label';
    qLabel.textContent = 'Survey Question';

    const qText = document.createElement('div');
    qText.className = 'sq-text block-content';
    qText.contentEditable = !state.reviewMode;
    qText.spellcheck = false;
    qText.dataset.placeholder = 'Type your question here…';
    qText.textContent = block.text || '';
    applyStyle(qText, block);

    const qResp = document.createElement('textarea');
    qResp.className = 'sq-response';
    qResp.placeholder = 'Response will appear here…';
    qResp.value = block.questionResponse || '';
    qResp.rows = 3;

    // Plain-text-only paste
    [qText].forEach(ce => {
      ce.addEventListener('paste', e => {
        e.preventDefault();
        const txt = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, txt);
      });
    });

    qText.addEventListener('input', () => updateBlock(block.id, { text: qText.textContent }));
    qText.addEventListener('keydown', e => e.stopPropagation());
    qText.addEventListener('focus', () => selectBlock(block.id));
    qResp.addEventListener('input', () => updateBlock(block.id, { questionResponse: qResp.value }));
    qResp.addEventListener('focus', () => selectBlock(block.id));

    inner.appendChild(qLabel);
    inner.appendChild(qText);
    inner.appendChild(qResp);
    el.appendChild(dragHandle);
    el.appendChild(inner);
  } else {
    // Normal block
    const c = document.createElement('div');
    c.className = 'block-content';
    c.contentEditable = !state.reviewMode;
    c.spellcheck = false;
    c.dataset.placeholder = 'Type here…';
    c.textContent = block.text;
    applyStyle(c, block);

    // Plain-text-only paste
    c.addEventListener('paste', e => {
      e.preventDefault();
      const txt = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, txt);
    });

    c.addEventListener('input', () => updateBlock(block.id, { text: c.textContent }));
    c.addEventListener('keydown', e => e.stopPropagation());
    c.addEventListener('focus', () => selectBlock(block.id));

    const lbl = document.createElement('div');
    lbl.className = 'block-label-tag';
    lbl.textContent = block.label || '';
    lbl.style.display = block.label ? '' : 'none';

    el.appendChild(dragHandle);
    el.appendChild(c);
    el.appendChild(lbl);
  }

  el.addEventListener('mousedown', e => {
    if (e.target.closest('.block-content,.sq-text,.sq-response')) return;
    e.preventDefault();
    selectBlock(block.id);
  });
  return el;
}

function initSortable(container) {
  if (_sortable) _sortable.destroy();
  if (!window.Sortable) return;
  _sortable = Sortable.create(container, {
    animation: 120, handle: '.block-drag-handle',
    draggable: '.block',
    ghostClass: 'sortable-ghost', chosenClass: 'sortable-chosen',
    onEnd(evt) {
      const id = evt.item.dataset.blockId;
      const blocks = getBlocks();
      const from = blocks.findIndex(b => b.id === id);
      if (from === -1) return;
      const [b] = blocks.splice(from, 1);
      const newIdx = Array.from(container.querySelectorAll('.block')).indexOf(evt.item);
      blocks.splice(Math.max(0, newIdx), 0, b);
      state.isDirty = true;
    }
  });
}

// ── Syllabic Grid ────────────────────────────────────────
function renderGrid() {
  const canvas = document.getElementById('specimen-canvas');
  canvas.className = 'specimen-canvas grid-canvas';
  canvas.removeAttribute('style');
  const blocks = getBlocks(), s = getGridSettings();

  if (!blocks.length) {
    canvas.innerHTML = `<div class="canvas-empty"><div class="canvas-empty-icon">ཀ</div><h3>No grid generated</h3><p>Enter consonants and vowel signs, then click <strong>Generate Grid</strong>. Or load a template.</p></div>`;
    return;
  }

  const consonants = splitTokens(s.consonantsRaw);
  const vowels = s.vowelData;
  if (!consonants.length || !vowels.length) {
    canvas.innerHTML = '<div class="canvas-empty"><p>Regenerate from the controls panel.</p></div>';
    return;
  }
  canvas.innerHTML = '';

  const baraBlocks = blocks.filter(b => b.gridSection === 'barakhadi');
  if (baraBlocks.length) {
    const sec = document.createElement('div');
    sec.className = 'grid-section';
    const lbl = document.createElement('div');
    lbl.className = 'grid-section-label';
    lbl.contentEditable = true;
    lbl.spellcheck = false;
    lbl.textContent = 'Barakhadi / Akshara Grid';
    lbl.addEventListener('paste', e => {
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    });
    sec.appendChild(lbl);

    const grid = document.createElement('div');
    grid.className = 'syllabic-grid';
    grid.style.gridTemplateColumns = `repeat(${vowels.length + 1}, auto)`;

    // Header row
    const corner = mkHeaderCell('');
    grid.appendChild(corner);
    vowels.forEach(v => grid.appendChild(mkHeaderCell(v.label)));

    const baraIdx = { idx: 0 };
    consonants.forEach(cons => {
      grid.appendChild(mkHeaderCell(cons));
      vowels.forEach(() => {
        if (baraIdx.idx < baraBlocks.length) {
          grid.appendChild(mkGridCell(baraBlocks[baraIdx.idx++], s));
        }
      });
    });
    sec.appendChild(grid);
    canvas.appendChild(sec);
  }

  const conjBlocks = blocks.filter(b => b.gridSection === 'conjunct');
  if (conjBlocks.length) {
    const sec = document.createElement('div');
    sec.className = 'grid-section';
    const lbl = document.createElement('div');
    lbl.className = 'grid-section-label';
    lbl.contentEditable = true;
    lbl.spellcheck = false;
    lbl.textContent = 'Conjuncts / Compounds';
    lbl.addEventListener('paste', e => {
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    });
    sec.appendChild(lbl);
    const cg = document.createElement('div');
    cg.className = 'conjunct-grid';
    conjBlocks.forEach(b => { const c = mkGridCell(b, s); c.classList.add('conjunct-cell'); cg.appendChild(c); });
    sec.appendChild(cg);
    canvas.appendChild(sec);
  }

  // Survey-question blocks appended below the grid
  const surveyBlocks = blocks.filter(b => b.type === 'survey-question');
  if (surveyBlocks.length) {
    const sec = document.createElement('div');
    sec.className = 'grid-section';
    const lbl = document.createElement('div');
    lbl.className = 'grid-section-label';
    lbl.textContent = 'Questions';
    sec.appendChild(lbl);
    surveyBlocks.forEach(b => sec.appendChild(mkBlockEl(b)));
    canvas.appendChild(sec);
  }
}

function mkHeaderCell(text) {
  const cell = document.createElement('div');
  cell.className = 'grid-cell grid-cell-header';
  cell.textContent = text;
  return cell;
}

function mkGridCell(block, s) {
  const cell = document.createElement('div');
  cell.className = 'grid-cell' + (block.id === state.selectedBlockId ? ' selected' : '');
  cell.dataset.blockId = block.id;

  const c = document.createElement('div');
  c.className = 'grid-cell-content';
  c.contentEditable = !state.reviewMode;
  c.spellcheck = false;
  c.textContent = block.text;
  c.style.fontSize = s.fontSize + 'px';
  c.style.fontFamily = getFontFamily(block.fontId);
  c.style.wordSpacing = 'normal';
  c.addEventListener('paste', e => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });

  const uni = document.createElement('div');
  uni.className = 'grid-cell-unicode';
  uni.textContent = [...block.text].map(ch => 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ');

  c.addEventListener('input', () => {
    updateBlock(block.id, { text: c.textContent });
    uni.textContent = [...c.textContent].map(ch => 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ');
  });
  c.addEventListener('focus', () => selectBlock(block.id));
  cell.addEventListener('mousedown', e => { if (e.target === c) return; e.preventDefault(); selectBlock(block.id); });
  cell.appendChild(c); cell.appendChild(uni);
  return cell;
}

function generateGrid() {
  const s = getGridSettings();
  const consonants = splitTokens(s.consonantsRaw);
  const vowels = s.vowelData;
  const conjuncts = s.conjunctsRaw ? splitTokens(s.conjunctsRaw) : [];
  if (!consonants.length || !vowels.length) { showToast('Enter consonants and vowel signs first.', true); return; }

  const fontId = state.fonts[0]?.id || null;
  const page = getPage();
  page.blocks = [];

  consonants.forEach(cons => {
    vowels.forEach(v => {
      page.blocks.push(makeBlock({ type: 'syllable', text: cons + v.sign, fontSize: s.fontSize, lineHeight: 1.2, textAlign: 'center', fontId, gridSection: 'barakhadi' }));
    });
  });
  conjuncts.forEach(conj => {
    page.blocks.push(makeBlock({ type: 'syllable', text: conj, fontSize: s.fontSize, lineHeight: 1.2, textAlign: 'center', fontId, gridSection: 'conjunct' }));
  });

  state.selectedBlockId = null; state.isDirty = true;
  renderSpecimen(); updateControls();
}

function loadGridTemplate(name) {
  fetch(`templates/syllabic-grid/${name}.json`)
    .then(r => r.json())
    .then(data => {
      const s = getGridSettings();
      s.consonantsRaw = data.consonants.join('\n');
      s.vowelData = data.vowelSigns;
      syncGridUI();
      generateGrid();
      showToast(`Loaded: ${data.name}`);
    })
    .catch(() => showToast('Template not found.', true));
}

function syncGridUI() {
  const s = getGridSettings();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('ctrl-consonants', s.consonantsRaw);
  set('ctrl-vowels', s.vowelData.map(v => v.sign).join('\n'));
  set('ctrl-conjuncts', s.conjunctsRaw || '');
  set('ctrl-grid-size', s.fontSize);
  set('ctrl-grid-size-num', s.fontSize);
}

// ── Device Mockup ────────────────────────────────────────
function renderDevice() {
  const canvas = document.getElementById('specimen-canvas');
  canvas.className = 'specimen-canvas device-mode';
  canvas.style.cssText = 'width:100%;padding:32px;box-shadow:none;background:var(--bg);min-height:640px;border-radius:0;display:flex;justify-content:center;align-items:flex-start';

  const frame = state.deviceFrame;
  const srcPage = state.paragraphPages[state.paragraphPageIdx];
  const blocks = (srcPage?.blocks || []).filter(b => b.type !== 'survey-question');

  canvas.innerHTML = `<div class="device-outer ${frame}">
    ${frame === 'phone' ? '<div class="device-notch-bar"><div class="device-dynamic-island"></div></div>' : ''}
    ${frame === 'desktop' ? `<div class="device-browser-bar">
      <div class="browser-dots"><span class="browser-dot"></span><span class="browser-dot"></span><span class="browser-dot"></span></div>
      <div class="browser-address">typori.app/specimen</div></div>` : ''}
    <div class="device-screen">
      <div class="device-inner-scroll">
        <div id="device-blocks-container"></div>
      </div>
    </div>
    ${frame === 'phone' ? '<div class="device-home-bar"></div>' : ''}
  </div>`;

  const container = document.getElementById('device-blocks-container');
  const visibleBlocks = blocks.slice(0, 6); // show first 6 blocks; device screen is finite
  if (!visibleBlocks.length) {
    container.innerHTML = '<div style="padding:32px 16px;text-align:center;color:#bbb;font-family:system-ui;font-size:12px">Switch to Paragraph tab to add content.</div>';
    return;
  }
  visibleBlocks.forEach(block => {
    const el = document.createElement('div');
    el.className = 'device-preview-block';
    el.dataset.blockId = block.id;
    const bg = block.backgroundColor;
    if (bg && bg !== 'transparent') el.style.backgroundColor = bg;
    if (block.bgImage) { el.style.backgroundImage = `url(${block.bgImage})`; el.style.backgroundSize = 'cover'; }
    if (block.padding) el.style.padding = block.padding + 'px';

    // Editable content — changes sync back to the paragraph block state
    const c = document.createElement('div');
    c.className = 'device-preview-content';
    c.contentEditable = true;
    c.spellcheck = false;
    c.textContent = block.text;
    applyStyle(c, block);
    c.addEventListener('paste', e => {
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    });
    c.addEventListener('input', () => {
      // Sync back to the source paragraph block
      const srcPage = state.paragraphPages[state.paragraphPageIdx];
      const srcBlock = srcPage?.blocks.find(b => b.id === block.id);
      if (srcBlock) { srcBlock.text = c.textContent; state.isDirty = true; }
    });

    el.appendChild(c);
    if (block.label) {
      const lbl = document.createElement('div');
      lbl.className = 'block-label-tag'; lbl.textContent = block.label;
      el.appendChild(lbl);
    }
    container.appendChild(el);
  });

  if (blocks.length > 6) {
    const more = document.createElement('div');
    more.style.cssText = 'text-align:center;font-size:11px;color:#bbb;font-family:system-ui;padding:8px;';
    more.textContent = `+${blocks.length - 6} more blocks (edit in Paragraph tab)`;
    container.appendChild(more);
  }
}

// ── Controls panel ───────────────────────────────────────
function updateControls() {
  const block = getBlocks().find(b => b.id === state.selectedBlockId);
  const bSec = document.getElementById('block-controls');
  const noSel = document.getElementById('no-selection-hint');

  if (!block) {
    if (bSec) bSec.style.display = 'none';
    if (noSel) noSel.style.display = '';
    return;
  }
  if (noSel) noSel.style.display = 'none';
  if (bSec) bSec.style.display = '';

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('ctrl-type', block.type);
  set('ctrl-font', block.fontId || '');
  set('ctrl-size-range', block.fontSize);
  set('ctrl-size-num', block.fontSize);
  set('ctrl-lh-range', block.lineHeight);
  set('ctrl-lh-num', block.lineHeight);
  set('ctrl-ls-range', block.letterSpacing);
  set('ctrl-ls-num', block.letterSpacing);
  set('ctrl-color', block.color || '#111111');
  set('ctrl-label', block.label || '');
  set('ctrl-padding-range', block.padding || 0);
  set('ctrl-padding-num', block.padding || 0);
  set('ctrl-border-width', block.borderWidth || 0);
  set('ctrl-border-color', block.borderColor || '#111111');

  // Column span
  document.querySelectorAll('.col-btn').forEach(b => b.classList.toggle('active', String(block.colSpan || 2) === b.dataset.col));

  const hasBg = block.backgroundColor && block.backgroundColor !== 'transparent';
  const bgIn = document.getElementById('ctrl-bgcolor');
  if (bgIn) bgIn.value = hasBg ? block.backgroundColor : '#ffffff';
  document.getElementById('btn-transparent-bg')?.classList.toggle('active', !hasBg);

  document.querySelectorAll('.align-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.align === block.textAlign);
  });
  updateCSSPreview(block);
}

function updateCSSPreview(block) {
  const el = document.getElementById('css-preview');
  if (!el || !block) return;
  const bg = (block.backgroundColor && block.backgroundColor !== 'transparent') ? `\n  background-color: ${block.backgroundColor};` : '';
  el.textContent = `.block {\n  font-family: "${getDisplayName(block.fontId)}", sans-serif;\n  font-size: ${block.fontSize}px;\n  line-height: ${block.lineHeight};\n  letter-spacing: ${block.letterSpacing}px;\n  color: ${block.color};${bg}\n  text-align: ${block.textAlign};\n}`;
}

function bindControls() {
  function syncSlider(rId, nId, key, parse = Number) {
    const r = document.getElementById(rId), n = document.getElementById(nId);
    if (!r || !n) return;
    const upd = v => {
      if (!state.selectedBlockId) return;
      updateBlock(state.selectedBlockId, { [key]: parse(v) });
      refreshBlockEl(state.selectedBlockId);
      updateCSSPreview(getBlocks().find(b => b.id === state.selectedBlockId));
    };
    r.addEventListener('input', () => { n.value = r.value; upd(r.value); });
    n.addEventListener('input', () => { r.value = n.value; upd(n.value); });
  }
  syncSlider('ctrl-size-range', 'ctrl-size-num', 'fontSize');
  syncSlider('ctrl-lh-range', 'ctrl-lh-num', 'lineHeight', parseFloat);
  syncSlider('ctrl-ls-range', 'ctrl-ls-num', 'letterSpacing', parseFloat);
  syncSlider('ctrl-padding-range', 'ctrl-padding-num', 'padding');

  document.getElementById('ctrl-border-width')?.addEventListener('input', e => {
    if (!state.selectedBlockId) return;
    updateBlock(state.selectedBlockId, { borderWidth: parseInt(e.target.value) || 0 });
    refreshBlockEl(state.selectedBlockId);
  });
  document.getElementById('ctrl-border-color')?.addEventListener('input', e => {
    if (!state.selectedBlockId) return;
    updateBlock(state.selectedBlockId, { borderColor: e.target.value });
    refreshBlockEl(state.selectedBlockId);
  });

  document.getElementById('ctrl-type')?.addEventListener('change', e => {
    if (!state.selectedBlockId) return;
    const type = e.target.value;
    const def = TYPE_DEFAULTS[type] || TYPE_DEFAULTS.paragraph;
    updateBlock(state.selectedBlockId, { type, fontSize: def.fontSize, lineHeight: def.lineHeight, textAlign: def.textAlign });
    renderSpecimen(); selectBlock(state.selectedBlockId);
  });
  document.getElementById('ctrl-font')?.addEventListener('change', e => {
    if (!state.selectedBlockId) return;
    updateBlock(state.selectedBlockId, { fontId: e.target.value || null });
    refreshBlockEl(state.selectedBlockId);
    updateCSSPreview(getBlocks().find(b => b.id === state.selectedBlockId));
  });
  document.getElementById('ctrl-color')?.addEventListener('input', e => {
    if (!state.selectedBlockId) return;
    updateBlock(state.selectedBlockId, { color: e.target.value });
    refreshBlockEl(state.selectedBlockId);
  });
  document.getElementById('ctrl-bgcolor')?.addEventListener('input', e => {
    if (!state.selectedBlockId) return;
    updateBlock(state.selectedBlockId, { backgroundColor: e.target.value });
    document.getElementById('btn-transparent-bg')?.classList.remove('active');
    refreshBlockEl(state.selectedBlockId);
  });
  document.getElementById('btn-transparent-bg')?.addEventListener('click', () => {
    if (!state.selectedBlockId) return;
    updateBlock(state.selectedBlockId, { backgroundColor: 'transparent', bgImage: null });
    document.getElementById('btn-transparent-bg')?.classList.add('active');
    refreshBlockEl(state.selectedBlockId);
  });
  document.getElementById('btn-invert')?.addEventListener('click', () => {
    if (!state.selectedBlockId) return;
    const b = getBlocks().find(b => b.id === state.selectedBlockId);
    if (!b) return;
    const fg = b.color, bg = (!b.backgroundColor || b.backgroundColor === 'transparent') ? '#ffffff' : b.backgroundColor;
    updateBlock(b.id, { color: bg, backgroundColor: fg });
    updateControls(); refreshBlockEl(b.id);
  });
  document.querySelectorAll('.align-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.selectedBlockId) return;
      const a = btn.dataset.align;
      updateBlock(state.selectedBlockId, { textAlign: a });
      refreshBlockEl(state.selectedBlockId);
      document.querySelectorAll('.align-btn').forEach(b => b.classList.toggle('active', b.dataset.align === a));
    });
  });
  document.querySelectorAll('.col-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.selectedBlockId) return;
      const span = parseInt(btn.dataset.col);
      updateBlock(state.selectedBlockId, { colSpan: span });
      refreshBlockEl(state.selectedBlockId);
      // Re-render to update grid layout
      renderSpecimen(); selectBlock(state.selectedBlockId);
    });
  });
  document.getElementById('ctrl-label')?.addEventListener('input', e => {
    if (!state.selectedBlockId) return;
    updateBlock(state.selectedBlockId, { label: e.target.value });
    const lbl = document.querySelector(`[data-block-id="${state.selectedBlockId}"] .block-label-tag`);
    if (lbl) { lbl.textContent = e.target.value; lbl.style.display = e.target.value ? '' : 'none'; }
  });
  document.getElementById('btn-duplicate')?.addEventListener('click', () => { if (state.selectedBlockId) duplicateBlock(state.selectedBlockId); });
  document.getElementById('btn-delete')?.addEventListener('click', () => { if (state.selectedBlockId) deleteBlock(state.selectedBlockId); });
  document.getElementById('btn-move-up')?.addEventListener('click', () => { if (state.selectedBlockId) moveBlockUp(state.selectedBlockId); });
  document.getElementById('btn-move-down')?.addEventListener('click', () => { if (state.selectedBlockId) moveBlockDown(state.selectedBlockId); });
  document.getElementById('btn-copy-css')?.addEventListener('click', () => {
    const el = document.getElementById('css-preview');
    if (el) navigator.clipboard.writeText(el.textContent).then(() => showToast('CSS copied!'));
  });

  // Background image upload
  document.getElementById('ctrl-bg-image')?.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f || !state.selectedBlockId) return;
    const r = new FileReader();
    r.onload = ev => {
      updateBlock(state.selectedBlockId, { bgImage: ev.target.result, backgroundColor: 'transparent' });
      refreshBlockEl(state.selectedBlockId);
    };
    r.readAsDataURL(f);
    e.target.value = '';
  });
  document.getElementById('btn-clear-bg-image')?.addEventListener('click', () => {
    if (!state.selectedBlockId) return;
    updateBlock(state.selectedBlockId, { bgImage: null });
    refreshBlockEl(state.selectedBlockId);
  });

  // Global
  function syncGlobal(rId, nId, key) {
    const r = document.getElementById(rId), n = document.getElementById(nId);
    if (!r || !n) return;
    const upd = v => { state.globalSettings[key] = parseFloat(v); applyGlobal(); };
    r.addEventListener('input', () => { n.value = r.value; upd(r.value); });
    n.addEventListener('input', () => { r.value = n.value; upd(n.value); });
  }
  syncGlobal('ctrl-global-size', 'ctrl-global-size-num', 'bodyFontSize');
  syncGlobal('ctrl-global-lh', 'ctrl-global-lh-num', 'bodyLineHeight');

  // Grid controls
  document.getElementById('ctrl-consonants')?.addEventListener('input', e => { getGridSettings().consonantsRaw = e.target.value; });
  document.getElementById('ctrl-vowels')?.addEventListener('input', e => {
    getGridSettings().vowelData = e.target.value.split('\n').map(sign => ({ label: sign.trim() === '' ? '—' : sign.trim(), sign: sign.trim() }));
  });
  document.getElementById('ctrl-conjuncts')?.addEventListener('input', e => { getGridSettings().conjunctsRaw = e.target.value; });

  const gsr = document.getElementById('ctrl-grid-size'), gsn = document.getElementById('ctrl-grid-size-num');
  const syncGrid = v => { getGridSettings().fontSize = parseInt(v); document.querySelectorAll('.grid-cell-content').forEach(el => { el.style.fontSize = v + 'px'; }); };
  gsr?.addEventListener('input', () => { if (gsn) gsn.value = gsr.value; syncGrid(gsr.value); });
  gsn?.addEventListener('input', () => { if (gsr) gsr.value = gsn.value; syncGrid(gsn.value); });
  document.getElementById('btn-generate-grid')?.addEventListener('click', generateGrid);
  document.querySelectorAll('[data-template]').forEach(btn => btn.addEventListener('click', () => loadGridTemplate(btn.dataset.template)));

  // Device
  document.querySelectorAll('.device-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.deviceFrame = btn.dataset.device;
      document.querySelectorAll('.device-btn').forEach(b => b.classList.toggle('active', b.dataset.device === state.deviceFrame));
      renderSpecimen();
    });
  });

  // Survey sidebar
  document.getElementById('btn-toggle-survey')?.addEventListener('click', () => {
    const body = document.getElementById('survey-body');
    const btn = document.getElementById('btn-toggle-survey');
    if (body) { const open = body.style.display !== 'none'; body.style.display = open ? 'none' : ''; if (btn) btn.textContent = open ? 'Show' : 'Hide'; }
  });
  document.getElementById('btn-add-survey-q')?.addEventListener('click', addSurveyQ);
  document.getElementById('btn-export-survey')?.addEventListener('click', exportSurveyQs);
  document.getElementById('btn-export-responses')?.addEventListener('click', exportSurveyResp);
}

function applyGlobal() {
  if (state.mode !== 'paragraph') return;
  document.querySelectorAll('.block[data-type="paragraph"] .block-content').forEach(el => {
    el.style.fontSize = state.globalSettings.bodyFontSize + 'px';
    el.style.lineHeight = state.globalSettings.bodyLineHeight;
  });
}

// ── PDF page size table ──────────────────────────────────
const PDF_SIZES = {
  A4:     { w: 794,  h: 1123, label: 'A4 (210×297mm)' },
  A5:     { w: 559,  h: 794,  label: 'A5 (148×210mm)' },
  Letter: { w: 816,  h: 1056, label: 'Letter (8.5×11in)' },
  Legal:  { w: 816,  h: 1344, label: 'Legal (8.5×14in)' },
};

// ── PDF Export ───────────────────────────────────────────
function mkPrintBlock(block) {
  const wrap = document.createElement('div');
  wrap.className = 'print-block';
  const bg = block.backgroundColor;
  if (block.bgImage) {
    wrap.style.backgroundImage = `url(${block.bgImage})`;
    wrap.style.backgroundSize = 'cover';
  } else if (bg && bg !== 'transparent') {
    wrap.style.backgroundColor = bg;
  }
  if (block.padding) wrap.style.padding = block.padding + 'px';
  if (block.borderWidth) wrap.style.border = `${block.borderWidth}px solid ${block.borderColor}`;

  if (block.type === 'survey-question') {
    const ql = document.createElement('div');
    ql.style.cssText = 'font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#aaa;margin-bottom:5px;font-family:system-ui';
    ql.textContent = 'Survey Question';
    const qt = document.createElement('div');
    qt.className = 'print-block-content';
    qt.textContent = block.text;
    applyStyle(qt, block);
    // Print response: checkbox (agree/yes) + open text field
    const resp = document.createElement('div');
    resp.style.cssText = 'margin-top:8px;font-family:system-ui;';
    const cbRow = document.createElement('div');
    cbRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px;color:#555;margin-bottom:6px;';
    cbRow.innerHTML = '<input type="checkbox" style="width:12px;height:12px;"> <span>Yes / Agree</span>';
    const textBox = document.createElement('div');
    textBox.style.cssText = 'border:1px solid #ccc;border-radius:3px;min-height:36px;margin-top:2px;';
    resp.appendChild(cbRow);
    resp.appendChild(textBox);
    wrap.appendChild(ql); wrap.appendChild(qt); wrap.appendChild(resp);
  } else {
    const c = document.createElement('div');
    c.className = 'print-block-content';
    c.textContent = block.text;
    applyStyle(c, block);
    wrap.appendChild(c);
  }

  if (block.label) {
    const lbl = document.createElement('div');
    lbl.className = 'print-block-label';
    lbl.textContent = block.label;
    wrap.appendChild(lbl);
  }
  return wrap;
}

function exportPDF() { showPDFExportModal(); }

function showPDFExportModal() {
  const modal = document.getElementById('pdf-export-modal');
  const list = document.getElementById('pdf-page-list');
  if (!modal || !list) return;

  // Populate page size select
  const sizeEl = document.getElementById('pdf-page-size');
  if (sizeEl && !sizeEl.children.length) {
    sizeEl.innerHTML = Object.entries(PDF_SIZES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  }

  let html = '<div class="pdf-page-group-label">Paragraph</div>';
  state.paragraphPages.forEach((p, i) => {
    html += `<label class="pdf-page-item"><input type="checkbox" class="pdf-page-check" data-mode="paragraph" data-idx="${i}" checked> <span>${esc(p.name)}</span></label>`;
  });

  const filledGrids = state.gridPages.filter(p => p.blocks.length);
  if (filledGrids.length) {
    html += '<div class="pdf-page-group-label">Syllabic Grid</div>';
    state.gridPages.forEach((p, i) => {
      if (!p.blocks.length) return;
      html += `<label class="pdf-page-item"><input type="checkbox" class="pdf-page-check" data-mode="grid" data-idx="${i}" checked> <span>${esc(p.name)}</span></label>`;
    });
  }

  html += '<div class="pdf-page-group-label">Device Mockup</div>';
  const frame = state.deviceFrame;
  html += `<label class="pdf-page-item"><input type="checkbox" class="pdf-page-check" data-mode="device" data-idx="0"> <span>${frame.charAt(0).toUpperCase() + frame.slice(1)}</span></label>`;

  list.innerHTML = html;
  modal.style.display = 'flex';
}

// Build a print DOM section for one paragraph page
function buildPrintParagraphSection(page) {
  const frag = document.createDocumentFragment();
  if (state.paragraphPages.length > 1) {
    const hdr = document.createElement('div');
    hdr.className = 'print-page-name';
    hdr.textContent = page.name;
    frag.appendChild(hdr);
  }
  const needsGrid = page.blocks.some(b => b.colSpan === 1);
  if (needsGrid) {
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:0;';
    page.blocks.forEach(b => {
      const el = mkPrintBlock(b);
      if ((b.colSpan || 2) !== 1) el.style.gridColumn = '1 / -1';
      grid.appendChild(el);
    });
    frag.appendChild(grid);
  } else {
    page.blocks.forEach(b => frag.appendChild(mkPrintBlock(b)));
  }
  return frag;
}

// Build a print DOM section for one syllabic-grid page
function buildPrintGridSection(page) {
  const frag = document.createDocumentFragment();
  const s = page.settings || {};
  const consonants = splitTokens(s.consonantsRaw || '');
  const vowels = s.vowelData || [];
  const fontId = page.blocks[0]?.fontId || null;
  const fontFamily = getFontFamily(fontId);
  const fontSize = s.fontSize || 28;

  const hdr = document.createElement('div');
  hdr.className = 'print-page-name';
  hdr.textContent = page.name || 'Syllabic Grid';
  frag.appendChild(hdr);

  if (!consonants.length || !vowels.length) {
    const msg = document.createElement('p');
    msg.textContent = 'No grid data.';
    frag.appendChild(msg);
    return frag;
  }

  const table = document.createElement('table');
  table.className = 'print-grid-table';
  table.style.fontFamily = fontFamily;

  // Header row
  const thead = document.createElement('thead');
  const hrow = document.createElement('tr');
  const corner = document.createElement('th');
  corner.className = 'print-grid-hdr';
  hrow.appendChild(corner);
  vowels.forEach(v => {
    const th = document.createElement('th');
    th.className = 'print-grid-hdr';
    th.textContent = v.label || v.sign;
    hrow.appendChild(th);
  });
  thead.appendChild(hrow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const baraBlocks = page.blocks.filter(b => b.gridSection === 'barakhadi');
  let bidx = 0;
  consonants.forEach(cons => {
    const tr = document.createElement('tr');
    const rowHdr = document.createElement('th');
    rowHdr.className = 'print-grid-hdr';
    rowHdr.textContent = cons;
    tr.appendChild(rowHdr);
    vowels.forEach(() => {
      const td = document.createElement('td');
      td.className = 'print-grid-cell';
      td.style.fontSize = fontSize + 'px';
      td.style.fontFamily = fontFamily;
      if (bidx < baraBlocks.length) td.textContent = baraBlocks[bidx++].text;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  frag.appendChild(table);

  const conjBlocks = page.blocks.filter(b => b.gridSection === 'conjunct');
  if (conjBlocks.length) {
    const ch = document.createElement('div');
    ch.className = 'print-page-name';
    ch.style.marginTop = '24pt';
    ch.textContent = 'Conjuncts / Compounds';
    frag.appendChild(ch);
    const cg = document.createElement('div');
    cg.style.cssText = 'display:flex;flex-wrap:wrap;gap:6pt;';
    conjBlocks.forEach(b => {
      const cell = document.createElement('div');
      cell.style.cssText = `padding:6pt 10pt;border:1px solid #e0e0e0;font-size:${fontSize}px;font-family:${getFontFamily(b.fontId)};`;
      cell.textContent = b.text;
      cg.appendChild(cell);
    });
    frag.appendChild(cg);
  }
  return frag;
}

// Build a print DOM section for device mockup (phone frame, first 4 blocks only)
function buildPrintDeviceSection() {
  const frag = document.createDocumentFragment();
  const srcPage = state.paragraphPages[state.paragraphPageIdx];
  const blocks = (srcPage?.blocks || []).filter(b => b.type !== 'survey-question').slice(0, 5);

  const hdr = document.createElement('div');
  hdr.className = 'print-page-name';
  hdr.textContent = 'Device Mockup';
  frag.appendChild(hdr);

  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;justify-content:center;';
  const frame = document.createElement('div');
  frame.style.cssText = 'width:240pt;background:#1a1a1c;border-radius:36pt;padding:40pt 10pt 32pt;';
  const notch = document.createElement('div');
  notch.style.cssText = 'width:72pt;height:20pt;background:#000;border-radius:10pt;margin:0 auto 10pt;';
  const screen = document.createElement('div');
  screen.style.cssText = 'background:#fff;border-radius:26pt;padding:16pt;';
  blocks.forEach(b => {
    const c = document.createElement('div');
    c.style.cssText = 'padding-bottom:8pt;border-bottom:1px solid #f0f0f0;margin-bottom:6pt;';
    c.style.fontFamily = getFontFamily(b.fontId);
    c.style.fontSize = Math.min(b.fontSize, 18) + 'px';
    c.style.lineHeight = b.lineHeight;
    c.style.color = b.color || '#111';
    c.textContent = b.text;
    screen.appendChild(c);
  });
  const bar = document.createElement('div');
  bar.style.cssText = 'width:60pt;height:3pt;background:rgba(255,255,255,.25);border-radius:2pt;margin:10pt auto 0;';
  frame.appendChild(notch);
  frame.appendChild(screen);
  frame.appendChild(bar);
  wrap.appendChild(frame);
  frag.appendChild(wrap);
  return frag;
}

async function doExportPDF() {
  const modal = document.getElementById('pdf-export-modal');
  if (modal) modal.style.display = 'none';

  const checks = document.querySelectorAll('.pdf-page-check:checked');
  const selected = Array.from(checks).map(c => ({ mode: c.dataset.mode, idx: parseInt(c.dataset.idx) }));
  if (!selected.length) { showToast('No pages selected', true); return; }

  const sizeKey = document.getElementById('pdf-page-size')?.value || 'A4';
  const sizeMap = { A4: 'A4', A5: 'A5', Letter: 'letter', Legal: 'legal' };

  // Inject @page size (removes browser header/footer chrome)
  let sizeStyle = document.getElementById('print-size-style');
  if (!sizeStyle) { sizeStyle = document.createElement('style'); sizeStyle.id = 'print-size-style'; document.head.appendChild(sizeStyle); }
  sizeStyle.textContent = `@page { size: ${sizeMap[sizeKey] || 'A4'}; margin: 0; }`;

  const printRoot = document.getElementById('print-all-pages');
  if (!printRoot) { showToast('Print container missing', true); return; }
  printRoot.innerHTML = '';

  selected.forEach(({ mode, idx }, si) => {
    const pageDiv = document.createElement('div');
    pageDiv.className = si === 0 ? 'print-page' : 'print-page print-page-break';
    let frag;
    if (mode === 'paragraph') frag = buildPrintParagraphSection(state.paragraphPages[idx]);
    else if (mode === 'grid')  frag = buildPrintGridSection(state.gridPages[idx]);
    else if (mode === 'device') frag = buildPrintDeviceSection();
    if (frag) pageDiv.appendChild(frag);
    printRoot.appendChild(pageDiv);
  });

  await new Promise(r => setTimeout(r, 80));
  window.print();
  // Clean up size style after print dialog closes
  setTimeout(() => { if (sizeStyle) sizeStyle.textContent = ''; }, 2000);
}

async function exportPNG() {
  if (!window.html2canvas) { showToast('html2canvas not loaded', true); return; }
  try {
    const prevSel = state.selectedBlockId;
    deselectAll();
    document.querySelectorAll('.add-block-placeholder,.block-drag-handle').forEach(el => el.style.visibility = 'hidden');
    showToast('Rendering…');
    await new Promise(r => setTimeout(r, 80));
    const target = document.getElementById('specimen-canvas');
    if (!target) return;
    const canvas = await html2canvas(target, {
      backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false,
      onclone(_d, cl) { cl.style.height = 'auto'; cl.style.overflow = 'visible'; let p = cl.parentElement; while (p) { p.style.overflow = 'visible'; p.style.height = 'auto'; p = p.parentElement; } }
    });
    canvas.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'typori-specimen.png'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
    showToast('PNG exported');
    document.querySelectorAll('.add-block-placeholder,.block-drag-handle').forEach(el => el.style.visibility = '');
    if (prevSel) selectBlock(prevSel);
  } catch (e) { showToast('PNG failed: ' + e.message, true); }
}

// ── Serialize / Import ───────────────────────────────────
function serialize() {
  const stripFont = blocks => (blocks || []).map(b => ({ ...b, fontRef: b.fontId ? getDisplayName(b.fontId) : null, fontId: undefined }));
  const stripPages = pages => (pages || []).map(p => ({ ...p, blocks: stripFont(p.blocks) }));
  return {
    version: 2,
    mode: state.mode, deviceFrame: state.deviceFrame,
    globalSettings: state.globalSettings,
    paragraphPages: stripPages(state.paragraphPages),
    gridPages: state.gridPages.map(p => ({ ...p, blocks: stripFont(p.blocks) })),
    survey: state.survey,
  };
}

function deserialize(data) {
  const res = fontRef => state.fonts.find(f => f.name === fontRef)?.id || null;
  const restoreBlocks = blocks => (blocks || []).map(b => { const { fontRef, ...rest } = b; return { ...makeBlock({ type: rest.type }), ...rest, fontId: res(fontRef) }; });
  const restorePages = pages => (pages || [makePage()]).map(p => ({ ...p, blocks: restoreBlocks(p.blocks) }));
  if (data.globalSettings) Object.assign(state.globalSettings, data.globalSettings);
  if (data.deviceFrame) state.deviceFrame = data.deviceFrame;
  state.paragraphPages = restorePages(data.paragraphPages);
  state.paragraphPageIdx = 0;
  state.gridPages = (data.gridPages || [makeGridPage()]).map(p => ({
    ...p, blocks: restoreBlocks(p.blocks),
    settings: p.settings || { consonantsRaw: '', vowelData: [], fontSize: 28, conjunctsRaw: '' }
  }));
  state.gridPageIdx = 0;
  if (data.survey) state.survey = { questions: data.survey.questions || [], responses: data.survey.responses || {} };
}

function exportJSON() { downloadFile(JSON.stringify(serialize(), null, 2), 'typori-specimen.json', 'application/json'); showToast('JSON saved'); }

function importData(text) {
  try {
    if (text.trimStart().startsWith('<?xml') || text.trimStart().startsWith('<typori')) {
      showToast('XML is export-only. Import a .json file instead.', true); return;
    }
    const data = JSON.parse(text);
    if (!data.version) throw new Error('Not a Typori JSON (missing version field)');
    deserialize(data);
    switchMode(data.mode || 'paragraph', false);
    applyGlobal();
    renderSurveyQs();
    state.isDirty = false;
    showToast('Imported');
  } catch (e) {
    if (e instanceof SyntaxError) showToast('Could not parse file — is it valid Typori JSON?', true);
    else showToast('Import failed: ' + e.message, true);
  }
}

async function saveToFile() {
  if (!('showSaveFilePicker' in window)) { exportJSON(); return; }
  try {
    if (!state.fileHandle) {
      state.fileHandle = await window.showSaveFilePicker({ suggestedName: 'typori-specimen.json', types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
    }
    const wr = await state.fileHandle.createWritable();
    await wr.write(JSON.stringify(serialize(), null, 2));
    await wr.close();
    state.isDirty = false;
    showToast('Saved');
  } catch (e) { if (e.name !== 'AbortError') showToast('Save failed: ' + e.message, true); }
}

// ── Autosave ─────────────────────────────────────────────
function autosave() {
  if (!state.isDirty) return;
  try { localStorage.setItem('typori-v2', JSON.stringify(serialize())); localStorage.setItem('typori-v2-time', Date.now()); state.isDirty = false; } catch (e) {}
}

function checkRestore() {
  try {
    const saved = localStorage.getItem('typori-v2');
    const t = parseInt(localStorage.getItem('typori-v2-time') || '0');
    if (!saved || Date.now() - t > 86400000) return;
    const mins = Math.round((Date.now() - t) / 60000);
    const banner = document.createElement('div');
    banner.className = 'top-banner restore-banner';
    banner.innerHTML = `<span>Unsaved work found from ${mins < 2 ? 'just now' : mins + ' min ago'}.</span>
      <button id="btn-restore-yes">Restore</button>
      <button class="dismiss-btn" id="btn-restore-no">Dismiss</button>`;
    document.querySelector('.app-body')?.prepend(banner);
    document.getElementById('btn-restore-yes')?.addEventListener('click', () => { importData(saved); banner.remove(); });
    document.getElementById('btn-restore-no')?.addEventListener('click', () => banner.remove());
  } catch (e) {}
}

// ── Survey sidebar ────────────────────────────────────────
function loadDefaultSurvey() {
  fetch('questions/default_en.json').then(r => r.json())
    .then(data => { state.survey.questions = data.questions || []; renderSurveyQs(); })
    .catch(() => {});
}

function renderSurveyQs() {
  const el = document.getElementById('survey-questions');
  if (!el) return;
  if (!state.survey.questions.length) { el.innerHTML = '<div class="font-empty">No questions yet.</div>'; return; }
  el.innerHTML = state.survey.questions.map((q, i) => `
    <div class="survey-question">
      <div class="survey-q-hdr">
        <select class="survey-q-type-sel ctrl-select" data-q-type-idx="${i}" style="width:auto;font-size:10px;padding:2px 4px">
          <option value="text"${q.type==='text'?' selected':''}>Text</option>
          <option value="rating"${q.type==='rating'?' selected':''}>Rating</option>
          <option value="choice"${q.type==='choice'?' selected':''}>Choice</option>
        </select>
        <button class="font-item-remove" data-rm-q="${i}" title="Remove">✕</button>
      </div>
      <input class="survey-q-edit ctrl-input" data-q-edit-idx="${i}" value="${esc(q.text)}" placeholder="Question text…" style="margin-bottom:6px">
      ${q.type === 'rating' ? `<div class="rating-group">${Array.from({ length: (q.max || 5) - (q.min || 1) + 1 }, (_, n) => n + (q.min || 1)).map(n => `<button class="rating-btn${state.survey.responses[q.id] == n ? ' active' : ''}" data-qid="${q.id}" data-val="${n}">${n}</button>`).join('')}</div>` : ''}
      ${q.type === 'choice' ? `
        <textarea class="ctrl-textarea survey-choice-opts" data-q-opts-idx="${i}" rows="3" placeholder="One option per line…">${esc((q.options||[]).join('\n'))}</textarea>
        ${(q.options||[]).length ? `<div class="choice-group">${(q.options).map(o => `<label class="choice-opt"><input type="radio" name="sq_${q.id}" value="${esc(o)}" ${state.survey.responses[q.id] === o ? 'checked' : ''}> ${esc(o)}</label>`).join('')}</div>` : ''}
      ` : ''}
      ${q.type === 'text' ? `<textarea class="survey-response-text" data-qid="${q.id}" placeholder="Response…" rows="2">${esc(state.survey.responses[q.id] || '')}</textarea>` : ''}
    </div>
  `).join('');

  el.querySelectorAll('.survey-q-edit').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = parseInt(inp.dataset.qEditIdx);
      if (state.survey.questions[idx]) state.survey.questions[idx].text = inp.value;
    });
  });
  el.querySelectorAll('.survey-q-type-sel').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = parseInt(sel.dataset.qTypeIdx);
      if (state.survey.questions[idx]) { state.survey.questions[idx].type = sel.value; renderSurveyQs(); }
    });
  });
  el.querySelectorAll('.survey-choice-opts').forEach(ta => {
    ta.addEventListener('input', () => {
      const idx = parseInt(ta.dataset.qOptsIdx);
      if (state.survey.questions[idx]) {
        state.survey.questions[idx].options = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
      }
    });
  });
  el.querySelectorAll('[data-rm-q]').forEach(btn => {
    btn.addEventListener('click', () => { state.survey.questions.splice(parseInt(btn.dataset.rmQ), 1); renderSurveyQs(); });
  });
  el.querySelectorAll('.rating-btn').forEach(btn => {
    btn.addEventListener('click', () => { state.survey.responses[btn.dataset.qid] = parseInt(btn.dataset.val); renderSurveyQs(); });
  });
  el.querySelectorAll('input[type=radio]').forEach(inp => {
    inp.addEventListener('change', () => { state.survey.responses[inp.name.replace('sq_', '')] = inp.value; });
  });
  el.querySelectorAll('textarea').forEach(ta => {
    ta.addEventListener('input', () => { state.survey.responses[ta.dataset.qid] = ta.value; });
    ta.addEventListener('paste', e => {
      e.preventDefault();
      const txt = e.clipboardData.getData('text/plain');
      const start = ta.selectionStart, end = ta.selectionEnd;
      ta.value = ta.value.slice(0, start) + txt + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = start + txt.length;
    });
  });
}

function addSurveyQ() { state.survey.questions.push({ id: uid(), text: 'New question', type: 'text' }); renderSurveyQs(); }
function exportSurveyQs() { downloadFile(JSON.stringify({ questions: state.survey.questions }, null, 2), 'typori-questions.json', 'application/json'); showToast('Questions exported'); }
function exportSurveyResp() {
  const rows = [['Question', 'Response']];
  state.paragraphPages.forEach(p => {
    p.blocks.filter(b => b.type === 'survey-question').forEach(b => rows.push([b.text, b.questionResponse || '']));
  });
  state.survey.questions.forEach(q => rows.push([q.text, state.survey.responses[q.id] || '']));
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadFile(csv, 'typori-responses.csv', 'text/csv');
  showToast('Responses exported');
}

// ── Mode switching ────────────────────────────────────────
function switchMode(mode) {
  state.mode = mode; state.selectedBlockId = null;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  document.getElementById('grid-generator')?.style.setProperty('display', mode === 'syllabic-grid' ? '' : 'none');
  document.getElementById('device-selector')?.style.setProperty('display', mode === 'device-mockup' ? '' : 'none');
  document.getElementById('btn-add-block')?.style.setProperty('display', mode === 'device-mockup' ? 'none' : '');

  if (mode === 'paragraph' && state.paragraphPages.length === 1 && !state.paragraphPages[0].blocks.length) {
    loadDefaultTemplate(); return;
  }
  if (mode === 'syllabic-grid') syncGridUI();
  renderPageTabs(); renderSpecimen(); updateControls();
}

function loadDefaultTemplate() {
  fetch('templates/paragraph/default.json').then(r => r.json())
    .then(data => {
      const fontId = state.fonts[0]?.id || null;
      getPage().blocks = data.blocks.map(b => makeBlock({ ...b, fontId }));
      renderPageTabs(); renderSpecimen(); populateFontSelect();
    })
    .catch(() => { renderPageTabs(); renderSpecimen(); });
}

// ── Clipboard ─────────────────────────────────────────────
function initClipboard() {
  document.addEventListener('copy', e => {
    if (!document.activeElement?.isContentEditable) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', sel.toString());
  });
}

// ── Keyboard ─────────────────────────────────────────────
function initKeyboard() {
  document.addEventListener('keydown', e => {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key === 'd') { e.preventDefault(); if (state.selectedBlockId) duplicateBlock(state.selectedBlockId); }
    if (meta && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      const b = getBlocks().find(b => b.id === state.selectedBlockId);
      if (b) { updateBlock(b.id, { fontSize: clamp(b.fontSize + 2, 8, 300) }); updateControls(); refreshBlockEl(b.id); }
    }
    if (meta && e.key === '-') {
      e.preventDefault();
      const b = getBlocks().find(b => b.id === state.selectedBlockId);
      if (b) { updateBlock(b.id, { fontSize: clamp(b.fontSize - 2, 8, 300) }); updateControls(); refreshBlockEl(b.id); }
    }
    if (meta && e.key === 's') { e.preventDefault(); saveToFile(); }
    if (e.key === 'Escape') deselectAll();
    if (e.key === 'Delete' && e.shiftKey && state.selectedBlockId) { e.preventDefault(); deleteBlock(state.selectedBlockId); }
  });
}

// ── Events ───────────────────────────────────────────────
function initEvents() {
  document.querySelectorAll('.mode-btn').forEach(btn => btn.addEventListener('click', () => switchMode(btn.dataset.mode)));

  document.getElementById('btn-add-block')?.addEventListener('click', () => {
    if (state.mode === 'syllabic-grid') {
      const selType = document.getElementById('ctrl-type')?.value || 'syllable';
      if (selType === 'survey-question') {
        addBlock({ type: 'survey-question' });
      } else {
        addBlock({ type: 'syllable', fontSize: getGridSettings().fontSize, textAlign: 'center', gridSection: 'conjunct' });
      }
    } else {
      const selType = document.getElementById('ctrl-type')?.value || 'paragraph';
      addBlock({ type: selType });
    }
  });

  // Export dropdown
  document.getElementById('btn-export-menu')?.addEventListener('click', e => {
    e.stopPropagation();
    const m = document.getElementById('export-menu');
    if (m) m.style.display = m.style.display === 'block' ? 'none' : 'block';
  });
  document.addEventListener('click', () => { const m = document.getElementById('export-menu'); if (m) m.style.display = 'none'; });
  document.getElementById('btn-export-pdf')?.addEventListener('click', exportPDF);
  document.getElementById('btn-export-png')?.addEventListener('click', exportPNG);
  document.getElementById('btn-export-json')?.addEventListener('click', exportJSON);
  document.getElementById('btn-save-file')?.addEventListener('click', saveToFile);
  document.getElementById('btn-export-responses')?.addEventListener('click', exportSurveyResp);

  // PDF export modal
  document.getElementById('pdf-export-confirm')?.addEventListener('click', doExportPDF);
  document.getElementById('pdf-export-cancel')?.addEventListener('click', () => {
    const m = document.getElementById('pdf-export-modal');
    if (m) m.style.display = 'none';
  });
  document.getElementById('pdf-export-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
  });

  // Import
  const jsonIn = document.getElementById('json-input');
  jsonIn?.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = ev => importData(ev.target.result); r.readAsText(f);
    jsonIn.value = '';
  });

  // Fonts
  const fontIn = document.getElementById('font-input');
  fontIn?.addEventListener('change', e => { Array.from(e.target.files).forEach(loadFontFile); fontIn.value = ''; });

  // Drag-drop fonts
  const ov = document.getElementById('font-drop-overlay'); let dc = 0;
  document.addEventListener('dragenter', e => { dc++; if (e.dataTransfer.types.includes('Files')) ov?.classList.add('active'); });
  document.addEventListener('dragleave', () => { dc--; if (dc <= 0) { dc = 0; ov?.classList.remove('active'); } });
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault(); dc = 0; ov?.classList.remove('active');
    const files = Array.from(e.dataTransfer.files).filter(f => /\.(ttf|otf|woff|woff2)$/i.test(f.name));
    if (files.length) files.forEach(loadFontFile);
    else if (e.dataTransfer.files.length) showToast('Drop a TTF, OTF, WOFF, or WOFF2 file', true);
  });

  // Font panel
  document.getElementById('font-list')?.addEventListener('click', e => {
    const rem = e.target.closest('[data-remove-font]');
    if (rem) { removeFont(rem.dataset.removeFont); return; }
    const feat = e.target.closest('.feat-tag');
    if (feat) {
      const f = state.fonts.find(f => f.id === feat.dataset.fontId);
      if (!f) return;
      const tag = feat.dataset.feat, cur = f.featureSettings[tag];
      if (cur === undefined) f.featureSettings[tag] = 1;
      else if (cur === 1) f.featureSettings[tag] = 0;
      else delete f.featureSettings[tag];
      renderFontPanel(); renderSpecimen();
    }
  });

  // Page nav
  document.getElementById('page-nav')?.addEventListener('click', e => {
    if (e.target.closest('#btn-add-page')) { addPage(); return; }
    const closeBtn = e.target.closest('[data-close-page]');
    if (closeBtn) { deletePage(parseInt(closeBtn.dataset.closePage)); return; }
    const tab = e.target.closest('[data-page-idx]');
    if (tab) switchPage(parseInt(tab.dataset.pageIdx));
  });

  // Grid template buttons
  document.querySelectorAll('[data-template]').forEach(btn => btn.addEventListener('click', () => loadGridTemplate(btn.dataset.template)));

  // Paragraph template picker
  document.querySelectorAll('[data-load-template]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Load template? This will replace the current page.')) return;
      const name = btn.dataset.loadTemplate;
      fetch(`templates/paragraph/${name}.json`).then(r => r.json()).then(data => {
        const fontId = state.fonts[0]?.id || null;
        getPage().blocks = data.blocks.map(b => makeBlock({ ...b, fontId: fontId || b.fontId }));
        state.selectedBlockId = null;
        state.isDirty = true;
        renderSpecimen(); updateControls();
        showToast(`Template: ${data.name || name}`);
      }).catch(() => showToast('Template not found', true));
    });
  });
}

// ── Init ─────────────────────────────────────────────────
function init() {
  bindControls();
  initEvents();
  initClipboard();
  initKeyboard();
  loadDefaultSurvey();
  checkRestore();
  setInterval(autosave, 30000);

  const gs = state.globalSettings;
  ['ctrl-global-size', 'ctrl-global-size-num'].forEach(id => { const el = document.getElementById(id); if (el) el.value = gs.bodyFontSize; });
  ['ctrl-global-lh', 'ctrl-global-lh-num'].forEach(id => { const el = document.getElementById(id); if (el) el.value = gs.bodyLineHeight; });

  switchMode('paragraph');
  loadSystemFonts(); // auto-run at startup
}

document.addEventListener('DOMContentLoaded', init);
