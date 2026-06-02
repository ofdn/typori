'use strict';
/* Typori feedback.js — two-persona survey panel (Designer / Tester) */

(function () {

  // ── Embedded fallback questions (works on file://, no server needed) ──
  const FALLBACK_QUESTIONS = [
    { id:'q1', type:'rating',  min:1, max:5,
      text:'How readable is the body text at the default size?',
      labels:{ min:'Not readable', max:'Very readable' } },
    { id:'q2', type:'rating',  min:1, max:5,
      text:'How well does the font handle conjuncts and complex script combinations?',
      labels:{ min:'Poor', max:'Excellent' } },
    { id:'q3', type:'choice',
      text:'Does the font feel appropriate for the intended use case?',
      options:['Yes, definitely','Mostly yes','Neutral','Mostly no','No'] },
    { id:'q4', type:'choice',
      text:'Which contexts would you use this font in?',
      options:['Body text (print)','Body text (screen)','Display / headlines','UI / interface','Captions / labels'] },
    { id:'q5', type:'text',
      text:'Please describe any specific issues you noticed (spacing, joins, specific characters).' },
    { id:'q6', type:'rating',  min:1, max:5,
      text:'Overall, how would you rate this font?',
      labels:{ min:'Needs work', max:'Excellent' } },
  ];

  const LS_KEY = 'typori-fb-v2';

  // ── State ────────────────────────────────────────────────────
  const fb = {
    mode: 'designer',          // 'designer' | 'tester'
    questionsLocked: false,    // true when questions came from an imported designer JSON
    questions: [],
    responses: {},
    annotations: {},           // { cardId: [ stroke, … ] }
    designer: { name:'', org:'', contact:'', instructions:'' },
    tester:   { name:'', contact:'', notes:'' },
  };

  // ── Persist state across page switches ───────────────────────
  function saveState() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        version: 2,
        mode: fb.mode,
        questionsLocked: fb.questionsLocked,
        questions: fb.questions,
        responses: fb.responses,
        annotations: fb.annotations,
        designer: fb.designer,
        tester:   fb.tester,
      }));
    } catch(e) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || s.version !== 2) return false;
      fb.mode            = s.mode            || 'designer';
      fb.questionsLocked = s.questionsLocked || false;
      fb.questions       = s.questions       || [];
      fb.responses       = s.responses       || {};
      fb.annotations     = s.annotations     || {};
      if (s.designer) Object.assign(fb.designer, s.designer);
      if (s.tester)   Object.assign(fb.tester,   s.tester);
      return true;
    } catch(e) { return false; }
  }

  // ── Utilities ────────────────────────────────────────────────
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function dl(content, name, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], {type:mime}));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function toast(msg, err) {
    let t = document.getElementById('fb-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'fb-toast';
      t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:8px 20px;font-size:13px;font-family:system-ui;font-weight:500;z-index:9999;pointer-events:none;border-radius:4px;box-shadow:0 4px 16px rgba(0,0,0,.2);transition:opacity .3s;opacity:0';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = err ? '#c0392b' : '#1a1c1c';
    t.style.color = '#fff';
    t.style.opacity = '1';
    clearTimeout(t._tid);
    t._tid = setTimeout(() => { t.style.opacity = '0'; }, 3200);
  }

  // ── Mode switch ──────────────────────────────────────────────
  function switchMode(mode) {
    fb.mode = mode;
    document.querySelectorAll('.fb-mode-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    // Attach or detach annotation overlays
    if (window.TyporiAnnotations) {
      if (mode === 'tester') window.TyporiAnnotations.attachToCards();
      else window.TyporiAnnotations.detachFromCards();
    }
    renderPanel();
    saveState();
  }

  // ── Default questions ────────────────────────────────────────
  function loadDefaults() {
    fetch('questions/default_en.json')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => {
        fb.questions = data.questions || [];
        fb.questionsLocked = false;
        renderPanel(); saveState(); toast('Default questions loaded.');
      })
      .catch(() => {
        fb.questions = FALLBACK_QUESTIONS.map(q => ({...q}));
        fb.questionsLocked = false;
        renderPanel(); saveState(); toast('Default questions loaded.');
      });
  }

  // ── Render panel body ────────────────────────────────────────
  function renderPanel() {
    const body = document.getElementById('fb-panel-body');
    if (!body) return;
    body.innerHTML = fb.mode === 'designer' ? designerHTML() : testerHTML();
    fb.mode === 'designer' ? bindDesigner() : bindTester();
  }

  // ── Designer HTML ────────────────────────────────────────────
  function designerHTML() {
    let qsSection = '';
    if (fb.questionsLocked) {
      // Questions came from an imported file — show read-only + unlock notice
      const qsPreview = fb.questions.length
        ? fb.questions.map((q, i) =>
            `<div class="fb-q-locked"><span class="fb-qn">${i+1}.</span><span class="fb-q-locked-text">${esc(q.text)}</span></div>`
          ).join('')
        : '<div class="fb-empty">No questions.</div>';
      qsSection = `
      <div class="fb-section">
        <span class="fb-sec-title">Questions</span>
        <div class="fb-locked-notice">
          <span class="fb-lock-icon">⚿</span> Questions are locked — imported from another file.
          <button class="fb-btn fb-unlock-btn" id="btn-unlock-qs">Unlock to edit</button>
        </div>
        <div id="fb-questions">${qsPreview}</div>
      </div>`;
    } else {
      const qsHTML = fb.questions.length
        ? fb.questions.map((q, i) => designerQuestionHTML(q, i)).join('')
        : '<div class="fb-empty">No questions yet — click Load defaults or + Add.</div>';
      qsSection = `
      <div class="fb-section">
        <span class="fb-sec-title">Questions</span>
        <div class="fb-row" style="margin-bottom:10px">
          <button class="fb-btn" id="btn-load-default">Load defaults</button>
          <button class="fb-btn" id="btn-add-q">+ Add question</button>
          <button class="fb-btn" id="btn-clear-qs">Clear all</button>
        </div>
        <div id="fb-questions">${qsHTML}</div>
      </div>`;
    }

    return `
    <div class="fb-section">
      <span class="fb-sec-title">Designer / Client Info</span>
      <input type="text" class="fb-inp" id="designer-name" placeholder="Your name" value="${esc(fb.designer.name)}">
      <input type="text" class="fb-inp" id="designer-org" placeholder="Organisation" value="${esc(fb.designer.org)}">
      <input type="text" class="fb-inp" id="designer-contact" placeholder="Email or contact" value="${esc(fb.designer.contact)}">
    </div>
    <div class="fb-divider"></div>
    <div class="fb-section">
      <span class="fb-sec-title">Brief for Tester</span>
      <textarea class="fb-inp" id="designer-instructions" rows="3" placeholder="Instructions for the tester — what to look for, which glyphs to focus on, any known issues…">${esc(fb.designer.instructions)}</textarea>
    </div>
    <div class="fb-divider"></div>
    ${qsSection}
    <div class="fb-divider"></div>
    <div class="fb-section">
      <p class="fb-hint">Export this JSON and send it to your tester. They import it, answer the questions, then export a PDF with all responses.</p>
      <button class="fb-btn p fb-btn-full" id="btn-export-json">Export JSON for Tester →</button>
      <button class="fb-btn fb-btn-full" id="btn-designer-import" style="margin-top:6px">Import JSON from colleague…</button>
      <input type="file" id="designer-import-inp" accept=".json" style="display:none">
    </div>`;
  }

  function designerQuestionHTML(q, i) {
    const typeOpts = ['text','rating','choice'].map(t =>
      `<option value="${t}"${q.type===t?' selected':''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`
    ).join('');
    let typeExtra = '';
    if (q.type === 'rating') {
      const min = Math.max(1, Math.min(q.min || 1, 9));
      const max = Math.max(min + 1, Math.min(q.max || 5, 10));
      typeExtra = `<div class="fb-q-extra">
        <div class="fb-q-extra-row">
          <label class="fb-tiny-label">Min</label>
          <input type="number" class="fb-num-inp" data-field="min" data-idx="${i}" value="${min}" min="1" max="9">
          <label class="fb-tiny-label" style="margin-left:8px">Max</label>
          <input type="number" class="fb-num-inp" data-field="max" data-idx="${i}" value="${max}" min="2" max="10">
        </div>
        <input type="text" class="fb-inp" style="margin-bottom:4px" placeholder="Min label (e.g. Not readable)" data-field="label-min" data-idx="${i}" value="${esc(q.labels?.min||'')}">
        <input type="text" class="fb-inp" placeholder="Max label (e.g. Very readable)" data-field="label-max" data-idx="${i}" value="${esc(q.labels?.max||'')}">
      </div>`;
    } else if (q.type === 'choice') {
      typeExtra = `<div class="fb-q-extra">
        <label class="fb-tiny-label">Options (one per line)</label>
        <textarea class="fb-inp fb-opts-ta" data-idx="${i}" rows="3" placeholder="Option 1&#10;Option 2&#10;Option 3">${esc((q.options||[]).join('\n'))}</textarea>
      </div>`;
    }
    return `<div class="fb-q-edit" data-idx="${i}">
      <div class="fb-q-edit-hdr">
        <span class="fb-qn">${i+1}.</span>
        <select class="fb-type-sel" data-idx="${i}">${typeOpts}</select>
        <button class="fb-q-del" data-idx="${i}" title="Remove question">✕</button>
      </div>
      <input type="text" class="fb-inp fb-q-text-inp" data-idx="${i}" placeholder="Question text…" value="${esc(q.text)}">
      ${typeExtra}
    </div>`;
  }

  function bindDesigner() {
    const body = document.getElementById('fb-panel-body');
    // Designer info
    const dMap = { name:'designer-name', org:'designer-org', contact:'designer-contact', instructions:'designer-instructions' };
    Object.entries(dMap).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el) el.oninput = () => { fb.designer[key] = el.value; saveState(); };
    });

    if (fb.questionsLocked) {
      document.getElementById('btn-unlock-qs')?.addEventListener('click', () => {
        if (confirm('Unlock questions? You will be able to edit the designer\'s questions.')) {
          fb.questionsLocked = false; renderPanel(); saveState();
        }
      });
    } else {
      // Question text changes
      body.querySelectorAll('.fb-q-text-inp').forEach(inp => {
        inp.addEventListener('input', () => {
          const i = parseInt(inp.dataset.idx);
          if (fb.questions[i]) { fb.questions[i].text = inp.value; saveState(); }
        });
      });
      // Type selector
      body.querySelectorAll('.fb-type-sel').forEach(sel => {
        sel.addEventListener('change', () => {
          const i = parseInt(sel.dataset.idx);
          if (!fb.questions[i]) return;
          fb.questions[i].type = sel.value;
          if (sel.value === 'rating') { fb.questions[i].min = fb.questions[i].min || 1; fb.questions[i].max = fb.questions[i].max || 5; }
          if (sel.value === 'choice' && !fb.questions[i].options) fb.questions[i].options = [];
          renderPanel(); saveState();
        });
      });
      // Rating min/max (clamped to 1–10)
      body.querySelectorAll('.fb-num-inp').forEach(inp => {
        inp.addEventListener('input', () => {
          const i = parseInt(inp.dataset.idx), field = inp.dataset.field;
          if (!fb.questions[i]) return;
          let v = parseInt(inp.value);
          if (field === 'min')  v = Math.max(1, Math.min(v || 1,  9));
          if (field === 'max')  v = Math.max(2, Math.min(v || 5, 10));
          fb.questions[i][field] = v; inp.value = v; saveState();
        });
      });
      // Rating labels
      body.querySelectorAll('[data-field^="label-"]').forEach(inp => {
        inp.addEventListener('input', () => {
          const i = parseInt(inp.dataset.idx), which = inp.dataset.field.replace('label-','');
          if (!fb.questions[i]) return;
          if (!fb.questions[i].labels) fb.questions[i].labels = {};
          fb.questions[i].labels[which] = inp.value; saveState();
        });
      });
      // Choice options
      body.querySelectorAll('.fb-opts-ta').forEach(ta => {
        ta.addEventListener('input', () => {
          const i = parseInt(ta.dataset.idx);
          if (!fb.questions[i]) return;
          fb.questions[i].options = ta.value.split('\n').map(s=>s.trim()).filter(Boolean); saveState();
        });
      });
      // Delete question
      body.querySelectorAll('.fb-q-del').forEach(btn => {
        btn.onclick = () => {
          const i = parseInt(btn.dataset.idx);
          fb.questions.splice(i, 1); renderPanel(); saveState();
        };
      });
      // Toolbar buttons
      document.getElementById('btn-load-default')?.addEventListener('click', loadDefaults);
      document.getElementById('btn-add-q')?.addEventListener('click', () => {
        fb.questions.push({ id:'q'+Date.now(), text:'', type:'text' });
        renderPanel(); saveState();
        const inputs = document.querySelectorAll('.fb-q-text-inp');
        inputs[inputs.length-1]?.focus();
      });
      document.getElementById('btn-clear-qs')?.addEventListener('click', () => {
        if (!fb.questions.length || confirm('Clear all questions?')) {
          fb.questions = []; fb.responses = {}; renderPanel(); saveState();
        }
      });
    }

    document.getElementById('btn-export-json')?.addEventListener('click', exportJSON);
    // Import from colleague — stays in designer mode
    const dImp = document.getElementById('designer-import-inp');
    document.getElementById('btn-designer-import')?.addEventListener('click', () => dImp?.click());
    dImp?.addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = ev => { importJSON(ev.target.result, 'designer'); };
      r.readAsText(f); e.target.value = '';
    });
  }

  // ── Tester HTML ──────────────────────────────────────────────
  function testerHTML() {
    const hasDesigner = fb.designer.name || fb.designer.org || fb.designer.contact || fb.designer.instructions;
    const designerBrief = hasDesigner ? `
    <div class="fb-section fb-designer-brief">
      <span class="fb-sec-title">From the Designer</span>
      ${(fb.designer.name || fb.designer.org) ? `<div class="fb-brief-who">${esc([fb.designer.name, fb.designer.org].filter(Boolean).join(' · '))}</div>` : ''}
      ${fb.designer.contact ? `<div class="fb-brief-contact">${esc(fb.designer.contact)}</div>` : ''}
      ${fb.designer.instructions ? `<div class="fb-brief-text">${esc(fb.designer.instructions)}</div>` : ''}
    </div>
    <div class="fb-divider"></div>` : '';

    const qsHTML = fb.questions.length
      ? fb.questions.map((q, i) => testerQuestionHTML(q, i)).join('')
      : '<div class="fb-empty">No questions — import a JSON file from your designer.</div>';

    return `
    ${designerBrief}
    <div class="fb-section">
      <span class="fb-sec-title">Import Designer's JSON</span>
      <div class="fb-row">
        <button class="fb-btn fb-btn-full" id="btn-fb-import">Import JSON file…</button>
        <input type="file" id="fb-import-inp" accept=".json">
      </div>
    </div>
    <div class="fb-divider"></div>
    <div class="fb-section">
      <span class="fb-sec-title">Your Info</span>
      <input type="text" class="fb-inp" id="tester-name" placeholder="Your name" value="${esc(fb.tester.name)}">
      <input type="text" class="fb-inp" id="tester-contact" placeholder="Email or contact" value="${esc(fb.tester.contact)}">
      <textarea class="fb-inp" id="tester-notes" placeholder="Additional notes (optional)" rows="2">${esc(fb.tester.notes)}</textarea>
    </div>
    <div class="fb-divider"></div>
    <div class="fb-section">
      <span class="fb-sec-title">Questions</span>
      <div id="fb-questions">${qsHTML}</div>
    </div>
    <div class="fb-divider"></div>
    <div class="fb-section">
      <span class="fb-sec-title">Annotations</span>
      <p class="fb-hint">Draw freehand or mark rectangles directly on the preview cards. Annotations are included when you export PDF.</p>
      <div class="fb-annot-toolbar" id="fb-annot-toolbar">
        <button class="fb-ann-tool active" data-tool="pen" title="Freehand pen">✏️ Pen</button>
        <button class="fb-ann-tool" data-tool="rect" title="Rectangle highlight">⬜ Box</button>
        <div class="fb-ann-colors">
          <button class="fb-ann-color active" data-color="#d34000" style="background:#d34000" title="Orange"></button>
          <button class="fb-ann-color" data-color="#1a1c1c" style="background:#1a1c1c" title="Black"></button>
          <button class="fb-ann-color" data-color="#0057ff" style="background:#0057ff" title="Blue"></button>
        </div>
        <button class="fb-btn" id="btn-clear-annot">Clear all</button>
      </div>
    </div>
    <div class="fb-divider"></div>
    <div class="fb-section">
      <span class="fb-sec-title">Reference PDF</span>
      <p class="fb-hint">Load the designer's PDF to view it alongside the live layout.</p>
      <button class="fb-btn fb-btn-full" id="btn-load-ref-pdf">Load reference PDF…</button>
      <input type="file" id="ref-pdf-inp" accept=".pdf" style="display:none">
    </div>
    <div class="fb-divider"></div>
    <div class="fb-section">
      <p class="fb-hint">When done, use Export PDF ▾ in the toolbar. Your responses, annotations, and tester info are added as the last page.</p>
      <button class="fb-btn fb-btn-full" id="btn-export-resp-json" style="margin-top:2px">Export Responses as JSON</button>
    </div>`;
  }

  function testerQuestionHTML(q, i) {
    let input = '';
    if (q.type === 'rating') {
      const min = q.min || 1, max = Math.min(q.max || 5, 10);
      const btns = Array.from({length: max - min + 1}, (_,n) => n + min).map(n =>
        `<button class="fb-num${fb.responses[q.id] == n ? ' on' : ''}" data-qid="${q.id}" data-v="${n}">${n}</button>`
      ).join('');
      input = `<div class="fb-rating">${btns}</div>`;
      if (q.labels) input += `<div class="fb-rlbls"><span>${esc(q.labels.min)}</span><span>${esc(q.labels.max)}</span></div>`;
    } else if (q.type === 'choice') {
      input = `<div class="fb-choices">${(q.options||[]).map(o =>
        `<label class="fb-choice"><input type="radio" name="fbq_${q.id}" value="${esc(o)}"${fb.responses[q.id]===o?' checked':''}> ${esc(o)}</label>`
      ).join('')}</div>`;
    } else {
      input = `<textarea class="fb-txt" data-qid="${q.id}" placeholder="Your response…" rows="2">${esc(fb.responses[q.id]||'')}</textarea>`;
    }
    return `<div class="fb-q">
      <div class="fb-qtext"><span class="fb-qn">${i+1}.</span>${esc(q.text)}</div>
      ${input}
    </div>`;
  }

  function bindTester() {
    const body = document.getElementById('fb-panel-body');
    ['name','contact','notes'].forEach(k => {
      const el = document.getElementById(`tester-${k}`);
      if (el) el.oninput = () => { fb.tester[k] = el.value; saveState(); };
    });
    const inp = document.getElementById('fb-import-inp');
    document.getElementById('btn-fb-import')?.addEventListener('click', () => inp?.click());
    inp?.addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader(); r.onload = ev => importJSON(ev.target.result, 'tester'); r.readAsText(f);
      e.target.value = '';
    });
    body.querySelectorAll('.fb-num').forEach(b => {
      b.onclick = () => { fb.responses[b.dataset.qid] = parseInt(b.dataset.v); renderPanel(); saveState(); };
    });
    body.querySelectorAll('[type=radio]').forEach(r => {
      r.onchange = () => { fb.responses[r.name.replace('fbq_','')] = r.value; saveState(); };
    });
    body.querySelectorAll('textarea.fb-txt').forEach(ta => {
      ta.oninput = () => { fb.responses[ta.dataset.qid] = ta.value; saveState(); };
    });
    document.getElementById('btn-export-resp-json')?.addEventListener('click', exportResponsesJSON);

    // Annotation toolbar
    const ann = window.TyporiAnnotations;
    if (ann) {
      body.querySelectorAll('.fb-ann-tool').forEach(btn => {
        if (btn.dataset.tool === ann.getTool()) btn.classList.add('active');
        btn.addEventListener('click', () => {
          body.querySelectorAll('.fb-ann-tool').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          ann.setTool(btn.dataset.tool);
        });
      });
      body.querySelectorAll('.fb-ann-color').forEach(btn => {
        if (btn.dataset.color === ann.getColor()) btn.classList.add('active');
        btn.addEventListener('click', () => {
          body.querySelectorAll('.fb-ann-color').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          ann.setColor(btn.dataset.color);
        });
      });
      document.getElementById('btn-clear-annot')?.addEventListener('click', () => {
        if (confirm('Clear all annotations?')) { ann.clearAll(); saveState(); }
      });
    }

    // Reference PDF viewer
    const pdfInp = document.getElementById('ref-pdf-inp');
    document.getElementById('btn-load-ref-pdf')?.addEventListener('click', () => pdfInp?.click());
    pdfInp?.addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      openRefPDF(URL.createObjectURL(f));
      e.target.value = '';
    });
  }

  function openRefPDF(url) {
    let panel = document.getElementById('ref-pdf-panel');
    if (!panel) {
      panel = document.createElement('div'); panel.id = 'ref-pdf-panel';
      panel.style.cssText = 'position:fixed;top:60px;right:360px;width:480px;height:680px;z-index:800;background:#fff;border:1px solid #e2dfdc;box-shadow:0 8px 32px rgba(0,0,0,.18);display:flex;flex-direction:column;resize:both;overflow:hidden;min-width:280px;min-height:320px;';
      const hdr = document.createElement('div');
      hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#1a1c1c;color:#fff;cursor:move;flex-shrink:0;user-select:none;font-family:monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;';
      hdr.innerHTML = '<span>Reference PDF</span><button id="btn-close-ref-pdf" style="background:none;border:none;color:rgba(255,255,255,.6);font-size:18px;cursor:pointer;line-height:1;padding:0 2px">✕</button>';
      const iframe = document.createElement('iframe'); iframe.id = 'ref-pdf-iframe';
      iframe.style.cssText = 'flex:1;border:none;';
      panel.appendChild(hdr); panel.appendChild(iframe);
      document.body.appendChild(panel);
      // Drag
      let dx = 0, dy = 0, dragging = false;
      hdr.addEventListener('pointerdown', e => {
        dragging = true; dx = e.clientX - panel.offsetLeft; dy = e.clientY - panel.offsetTop;
        hdr.setPointerCapture(e.pointerId);
      });
      hdr.addEventListener('pointermove', e => {
        if (!dragging) return;
        panel.style.left  = (e.clientX - dx) + 'px';
        panel.style.top   = (e.clientY - dy) + 'px';
        panel.style.right = 'auto';
      });
      hdr.addEventListener('pointerup', () => { dragging = false; });
      document.getElementById('btn-close-ref-pdf').onclick = () => panel.remove();
    }
    document.getElementById('ref-pdf-iframe').src = url;
    panel.style.display = 'flex';
  }

  // ── Collect full state for JSON export ───────────────────────
  function collectState(pageId) {
    const texts = {};
    ['title','sub','heading','body','note'].forEach(r => {
      const el = document.getElementById(`text-${r}`);
      if (el) texts[r] = el.value;
    });
    const fontRoles = {};
    ['title','sub','heading','body'].forEach(r => {
      fontRoles[r] = {
        family: document.getElementById(`fnt-${r}`)?.value || '',
        src:    document.getElementById(`src-${r}`)?.value || 'loaded',
      };
    });
    const bgColor  = document.getElementById('bg-color')?.value || '#f7f5f3';
    const bgTypeEl = document.querySelector('.bg-type-btn.active');
    return {
      version: '1.2', tool: 'typori', page: pageId,
      texts, fontRoles,
      background: { type: bgTypeEl?.dataset.bg || 'color', color: bgColor },
      designer: { ...fb.designer },
      survey: { questions: fb.questions, responses: fb.responses, annotations: fb.annotations },
      tester: { ...fb.tester },
    };
  }

  function exportJSON() {
    const pageId = document.body.dataset.page || 'display';
    dl(JSON.stringify(collectState(pageId), null, 2), 'typori-feedback.json', 'application/json');
    toast('JSON exported — send this file to your tester.');
  }

  function exportResponsesJSON() {
    const out = {
      version: '1.2', tool: 'typori', type: 'responses',
      date: new Date().toISOString(),
      designer: { ...fb.designer },
      tester:   { ...fb.tester },
      responses: fb.questions.map(q => ({
        question: q.text,
        type: q.type,
        response: fb.responses[q.id] ?? null,
      })),
    };
    dl(JSON.stringify(out, null, 2), 'typori-responses.json', 'application/json');
    toast('Responses exported as JSON.');
  }

  // ── Import JSON (persona-aware) ───────────────────────────────
  // persona: 'designer' stays in designer mode; 'tester' switches + locks questions
  function importJSON(text, persona) {
    try {
      const trimmed = text.trimStart();
      if (trimmed.startsWith('<?xml') || trimmed.startsWith('<typori')) {
        toast('XML cannot be imported — please use a .json file.', true); return;
      }
      const data = JSON.parse(text);
      if (!data.tool || data.tool !== 'typori') throw new Error('Not a Typori feedback JSON (missing "tool" field)');
      // Apply layout texts
      if (data.texts) {
        for (const [role, val] of Object.entries(data.texts)) {
          const el = document.getElementById(`text-${role}`);
          if (el) { el.value = val; el.dispatchEvent(new Event('input', {bubbles:true})); }
        }
      }
      if (data.designer) Object.assign(fb.designer, data.designer);
      if (data.survey)   {
        fb.questions   = data.survey.questions   || [];
        fb.responses   = data.survey.responses   || {};
        fb.annotations = data.survey.annotations || {};
      }
      if (data.tester)   Object.assign(fb.tester, data.tester);

      if (persona === 'tester') {
        fb.questionsLocked = true;   // tester cannot edit designer's questions
        fb.responses = {};           // fresh session; don't keep saved responses
        switchMode('tester');
        toast('Imported — you are now in Tester mode.');
      } else {
        fb.questionsLocked = false;  // designer can edit freely
        switchMode('designer');
        toast('Imported — questions are editable.');
      }
      saveState();
    } catch (e) {
      if (e instanceof SyntaxError) toast('Could not parse — is this a valid Typori JSON file?', true);
      else toast('Import failed: ' + e.message, true);
    }
  }

  // ── Q&A page for PDF ─────────────────────────────────────────
  function buildQAPage(loadedFontFaceCSS) {
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'});
    const timeStr = now.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});

    const qsHTML = fb.questions.length
      ? fb.questions.map((q, i) => {
          const resp = fb.responses[q.id];
          const hasResp = resp !== undefined && resp !== null && String(resp).trim() !== '';
          let respHTML = hasResp
            ? (q.type === 'rating'
                ? `<div class="qap-stars">${Array.from({length:q.max||5},(_,n)=>n+1).map(n =>
                    `<span class="${n<=resp?'qap-sf':'qap-se'}">${n<=resp?'★':'☆'}</span>`
                  ).join('')}<span class="qap-sn">${resp} / ${q.max||5}</span></div>`
                : `<div class="qap-ans">${esc(String(resp))}</div>`)
            : `<div class="qap-nr">— no response —</div>`;
          return `<div class="qap-item">
            <div class="qap-q"><strong>${i+1}.</strong> ${esc(q.text)}</div>
            ${respHTML}
          </div>`;
        }).join('')
      : '<p class="qap-empty">No questions were included in this review.</p>';

    const hasDesigner = fb.designer.name || fb.designer.org;
    const hasTester   = fb.tester.name || fb.tester.contact || fb.tester.notes;

    return `<style>
      @import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;800&family=JetBrains+Mono:wght@500&display=swap');
      ${loadedFontFaceCSS || ''}
      *{box-sizing:border-box;margin:0;padding:0}
      .qap{font-family:'Hanken Grotesk',system-ui,sans-serif;color:#1a1c1c;padding:36pt 48pt}
      .qap-stripe{height:4pt;background:#d34000;margin-bottom:20pt}
      .qap-ttl{font-size:22pt;font-weight:800;letter-spacing:-.03em;margin-bottom:4pt}
      .qap-subtitle{font-size:11pt;color:#916f65;margin-bottom:18pt}
      .qap-meta-row{display:flex;gap:24pt;padding:14pt 0;border-top:1.5pt solid #1a1c1c;border-bottom:1pt solid #e2dfdc;margin-bottom:20pt}
      .qap-mi{font-size:8pt;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.07em;color:#916f65}
      .qap-mi b{display:block;font-size:11pt;font-family:'Hanken Grotesk',system-ui,sans-serif;text-transform:none;letter-spacing:0;font-weight:600;color:#1a1c1c;margin-top:2pt}
      .qap-people{display:grid;grid-template-columns:1fr 1fr;gap:16pt;margin-bottom:20pt}
      .qap-person{background:#f7f5f3;padding:12pt 14pt}
      .qap-plbl{font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#916f65;margin-bottom:6pt;font-family:'JetBrains Mono',monospace}
      .qap-pname{font-size:14pt;font-weight:800;letter-spacing:-.02em;margin-bottom:2pt}
      .qap-porg{font-size:10pt;color:#5c4037}
      .qap-pcontact{font-size:9.5pt;color:#916f65;margin-top:3pt}
      .qap-pnotes{font-size:9pt;color:#916f65;margin-top:5pt;font-style:italic}
      .qap-brief{background:#1a1c1c;color:#fefcfa;padding:12pt 14pt;margin-bottom:20pt}
      .qap-blbl{font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.4);margin-bottom:5pt;font-family:'JetBrains Mono',monospace}
      .qap-btext{font-size:10.5pt;line-height:1.6;color:rgba(255,255,255,.85)}
      .qap-slbl{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#d34000;border-top:1pt solid #e2dfdc;padding-top:14pt;margin-bottom:12pt;font-family:'JetBrains Mono',monospace}
      .qap-item{margin-bottom:14pt;padding-bottom:14pt;border-bottom:1pt solid #edeae7}
      .qap-item:last-child{border-bottom:none}
      .qap-q{font-size:11.5pt;font-weight:600;margin-bottom:5pt;line-height:1.4}
      .qap-ans{font-size:10.5pt;color:#5c4037;line-height:1.6;white-space:pre-wrap}
      .qap-stars{font-size:15pt;letter-spacing:2pt}
      .qap-sf{color:#d34000}.qap-se{color:#ddd}
      .qap-sn{font-size:9pt;color:#916f65;vertical-align:middle;margin-left:5pt}
      .qap-nr{font-size:9.5pt;color:#c0b0aa;font-style:italic}
      .qap-empty{font-size:10pt;color:#916f65}
    </style>
    <div class="qap">
      <div class="qap-stripe"></div>
      <div class="qap-ttl">Font Feedback Report</div>
      <div class="qap-subtitle">Generated by Typori</div>
      <div class="qap-meta-row">
        <div class="qap-mi">Date<b>${esc(dateStr)}</b></div>
        <div class="qap-mi">Time<b>${esc(timeStr)}</b></div>
      </div>
      ${(hasDesigner || hasTester) ? `<div class="qap-people">
        ${hasDesigner ? `<div class="qap-person">
          <div class="qap-plbl">Designer / Client</div>
          ${fb.designer.name ? `<div class="qap-pname">${esc(fb.designer.name)}</div>` : ''}
          ${fb.designer.org  ? `<div class="qap-porg">${esc(fb.designer.org)}</div>`   : ''}
          ${fb.designer.contact ? `<div class="qap-pcontact">${esc(fb.designer.contact)}</div>` : ''}
        </div>` : '<div></div>'}
        ${hasTester ? `<div class="qap-person">
          <div class="qap-plbl">Tester</div>
          ${fb.tester.name    ? `<div class="qap-pname">${esc(fb.tester.name)}</div>`        : ''}
          ${fb.tester.contact ? `<div class="qap-pcontact">${esc(fb.tester.contact)}</div>`  : ''}
          ${fb.tester.notes   ? `<div class="qap-pnotes">${esc(fb.tester.notes)}</div>`      : ''}
        </div>` : '<div></div>'}
      </div>` : ''}
      ${fb.designer.instructions ? `<div class="qap-brief">
        <div class="qap-blbl">Brief from Designer</div>
        <div class="qap-btext">${esc(fb.designer.instructions)}</div>
      </div>` : ''}
      <div class="qap-slbl">Questions &amp; Responses</div>
      ${qsHTML}
      ${(() => {
        const annSummary = window.TyporiAnnotations?.annotationSummaryHTML?.() || '';
        if (!annSummary) return '';
        return `<div class="qap-slbl" style="margin-top:20pt">Annotations on Layout</div>
          <div style="font-size:9.5pt;color:#5c4037;font-family:'JetBrains Mono',monospace;line-height:1.8">${annSummary}</div>`;
      })()}
    </div>`;
  }

  // ── Init ─────────────────────────────────────────────────────
  function init() {
    // Restore state from previous session/page
    const restored = loadState();
    if (!restored && !fb.questions.length) {
      // Fresh start — load defaults silently
      loadDefaults();
    }

    // Panel open/close
    document.getElementById('btn-fb-panel')?.addEventListener('click', () => {
      const p = document.getElementById('fb-panel');
      if (p) { const o = p.classList.toggle('open'); document.body.classList.toggle('fb-open', o); }
    });
    document.getElementById('btn-fb-close')?.addEventListener('click', () => {
      document.getElementById('fb-panel')?.classList.remove('open');
      document.body.classList.remove('fb-open');
    });
    // Mode tabs (delegated — panel body is re-rendered)
    document.addEventListener('click', e => {
      const tab = e.target.closest('.fb-mode-tab');
      if (tab) switchMode(tab.dataset.mode);
    });
    // Sync mode tab visual state
    document.querySelectorAll('.fb-mode-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === fb.mode));
    renderPanel();
  }

  // ── Globals ───────────────────────────────────────────────────
  window.fb            = fb;
  window.fbInit        = init;
  window.fbBuildQAPage = buildQAPage;
  window.fbToast       = toast;
  window.fbSwitchMode  = switchMode;
  window.fbSaveState   = saveState;

})();
