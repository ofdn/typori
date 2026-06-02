'use strict';
/*
 * Typori annotations.js
 * SVG freehand + rectangle annotation layer for preview cards (tester mode only).
 * Annotations are stored in fb.annotations[cardId] as normalized stroke objects.
 * Strokes use x/y coordinates normalized to 0–1 relative to the card element,
 * so they scale correctly regardless of card dimensions.
 */

(function () {

  // ── Annotation state (stored on window.fb by feedback.js) ────
  // fb.annotations = { 'card-1': [ stroke, … ], … }
  // stroke = { tool:'pen'|'rect', color:'#…', pts:[[x,y],…] }

  const TOOLS = ['pen', 'rect'];
  const COLORS = ['#d34000', '#1a1c1c', '#ffffff'];

  let activeTool  = 'pen';
  let activeColor = '#d34000';
  let drawing     = false;
  let currentStroke = null;
  let currentEl   = null; // the in-progress SVG element

  // ── Init per card ────────────────────────────────────────────
  function initCard(cardId, cardEl) {
    // Don't add twice
    if (cardEl.querySelector('.annot-svg')) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'annot-svg');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:50;cursor:crosshair;touch-action:none;';
    cardEl.style.position = 'relative';
    cardEl.appendChild(svg);

    // Redraw saved strokes
    redrawCard(cardId, svg);

    // Pointer events
    svg.addEventListener('pointerdown', e => onDown(e, cardId, svg));
    svg.addEventListener('pointermove', e => onMove(e, cardId, svg));
    svg.addEventListener('pointerup',   e => onUp(e,   cardId, svg));
    svg.addEventListener('pointerleave',e => onUp(e,   cardId, svg));
  }

  function getAnnotations() {
    if (!window.fb) return {};
    if (!window.fb.annotations) window.fb.annotations = {};
    return window.fb.annotations;
  }

  function redrawCard(cardId, svg) {
    // Clear all drawn elements
    [...svg.children].filter(el => el.tagName !== 'defs').forEach(el => el.remove());
    const strokes = getAnnotations()[cardId] || [];
    strokes.forEach(s => renderStroke(svg, s, svg.clientWidth, svg.clientHeight));
  }

  function renderStroke(svg, stroke, w, h) {
    if (!stroke.pts.length) return;
    if (stroke.tool === 'pen') {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      let d = '';
      stroke.pts.forEach(([nx, ny], i) => {
        const x = nx * w, y = ny * h;
        d += (i === 0 ? `M${x},${y}` : ` L${x},${y}`);
      });
      path.setAttribute('d', d);
      path.setAttribute('stroke', stroke.color);
      path.setAttribute('stroke-width', stroke.width || 2.5);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);
    } else if (stroke.tool === 'rect' && stroke.pts.length >= 2) {
      const [nx1, ny1] = stroke.pts[0];
      const [nx2, ny2] = stroke.pts[stroke.pts.length - 1];
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x',      Math.min(nx1, nx2) * w);
      rect.setAttribute('y',      Math.min(ny1, ny2) * h);
      rect.setAttribute('width',  Math.abs(nx2 - nx1) * w);
      rect.setAttribute('height', Math.abs(ny2 - ny1) * h);
      rect.setAttribute('stroke', stroke.color);
      rect.setAttribute('stroke-width', stroke.width || 2.5);
      rect.setAttribute('fill', stroke.color + '22'); // 13% opacity
      svg.appendChild(rect);
    }
  }

  function normalizePoint(e, svg) {
    const r = svg.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }

  function onDown(e, cardId, svg) {
    if (!isAnnotationMode()) return;
    e.preventDefault();
    e.stopPropagation();
    svg.setPointerCapture(e.pointerId);
    drawing = true;
    const pt = normalizePoint(e, svg);
    currentStroke = { tool: activeTool, color: activeColor, width: activeTool === 'rect' ? 2 : 2.5, pts: [pt] };
    // Temporary live element
    currentEl = null;
    if (activeTool === 'pen') {
      currentEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      currentEl.setAttribute('stroke', activeColor);
      currentEl.setAttribute('stroke-width', currentStroke.width);
      currentEl.setAttribute('fill', 'none');
      currentEl.setAttribute('stroke-linecap', 'round');
      currentEl.setAttribute('stroke-linejoin', 'round');
      currentEl.setAttribute('class', 'annot-live');
      svg.appendChild(currentEl);
    } else if (activeTool === 'rect') {
      currentEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      currentEl.setAttribute('stroke', activeColor);
      currentEl.setAttribute('stroke-width', currentStroke.width);
      currentEl.setAttribute('fill', activeColor + '22');
      currentEl.setAttribute('class', 'annot-live');
      svg.appendChild(currentEl);
    }
    currentStroke._cardId = cardId;
    currentStroke._svg    = svg;
  }

  function onMove(e, cardId, svg) {
    if (!drawing || !currentStroke || !isAnnotationMode()) return;
    e.preventDefault();
    const pt = normalizePoint(e, svg);
    const w = svg.clientWidth, h = svg.clientHeight;
    if (activeTool === 'pen') {
      currentStroke.pts.push(pt);
      const d = currentStroke.pts.map(([nx,ny], i) => (i === 0 ? `M${nx*w},${ny*h}` : ` L${nx*w},${ny*h}`)).join('');
      currentEl?.setAttribute('d', d);
    } else if (activeTool === 'rect') {
      const [nx1, ny1] = currentStroke.pts[0];
      const [nx2, ny2] = pt;
      currentStroke.pts = [currentStroke.pts[0], pt];
      currentEl?.setAttribute('x',      Math.min(nx1,nx2)*w);
      currentEl?.setAttribute('y',      Math.min(ny1,ny2)*h);
      currentEl?.setAttribute('width',  Math.abs(nx2-nx1)*w);
      currentEl?.setAttribute('height', Math.abs(ny2-ny1)*h);
    }
  }

  function onUp(e, cardId, svg) {
    if (!drawing || !currentStroke || !isAnnotationMode()) return;
    drawing = false;
    // Remove live element; redraw cleanly from state
    currentEl?.remove(); currentEl = null;
    if (currentStroke.pts.length > 1) {
      const anns = getAnnotations();
      if (!anns[cardId]) anns[cardId] = [];
      anns[cardId].push({ tool: currentStroke.tool, color: currentStroke.color, width: currentStroke.width, pts: currentStroke.pts });
      if (window.fbSaveState) window.fbSaveState();
    }
    redrawCard(cardId, svg);
    currentStroke = null;
  }

  function isAnnotationMode() {
    return window.fb?.mode === 'tester';
  }

  // ── Public API ────────────────────────────────────────────────
  function attachToCards() {
    document.querySelectorAll('.preview-card[id]').forEach(cardEl => {
      initCard(cardEl.id, cardEl);
    });
  }

  function detachFromCards() {
    document.querySelectorAll('.annot-svg').forEach(svg => svg.remove());
  }

  function refreshCards() {
    document.querySelectorAll('.preview-card[id]').forEach(cardEl => {
      const svg = cardEl.querySelector('.annot-svg');
      if (svg) { redrawCard(cardEl.id, svg); }
      else if (isAnnotationMode()) { initCard(cardEl.id, cardEl); }
    });
  }

  function clearCard(cardId) {
    const anns = getAnnotations();
    anns[cardId] = [];
    const cardEl = document.getElementById(cardId);
    const svg = cardEl?.querySelector('.annot-svg');
    if (svg) redrawCard(cardId, svg);
    if (window.fbSaveState) window.fbSaveState();
  }

  function clearAll() {
    const anns = getAnnotations();
    Object.keys(anns).forEach(k => { anns[k] = []; });
    document.querySelectorAll('.preview-card[id]').forEach(cardEl => {
      const svg = cardEl.querySelector('.annot-svg');
      if (svg) redrawCard(cardEl.id, svg);
    });
    if (window.fbSaveState) window.fbSaveState();
  }

  function setTool(tool) { if (TOOLS.includes(tool)) activeTool = tool; }
  function setColor(color) { activeColor = color; }
  function getTool()  { return activeTool; }
  function getColor() { return activeColor; }

  // Return annotation summary text for the Q&A page
  function annotationSummaryHTML() {
    const anns = getAnnotations();
    const entries = Object.entries(anns).filter(([,v]) => v.length > 0);
    if (!entries.length) return '';
    return entries.map(([cardId, strokes]) =>
      `<div class="qap-ann-card"><span class="qap-ann-id">${cardId}</span> — ${strokes.length} annotation${strokes.length > 1 ? 's' : ''}</div>`
    ).join('');
  }

  window.TyporiAnnotations = {
    attachToCards, detachFromCards, refreshCards,
    clearCard, clearAll, setTool, setColor, getTool, getColor,
    annotationSummaryHTML, TOOLS, COLORS,
  };

})();
