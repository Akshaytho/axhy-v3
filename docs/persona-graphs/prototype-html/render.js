// AXHY persona-graph prototype 1 — renderer
// Reads spec.json, lays out 5 persona lanes, draws routes + cross-persona edges.
// No external libraries — pure browser DOM + SVG.

(function () {
  'use strict';

  const STATUS_GLYPH = {
    working: '✓', // check
    broken: '✗', // x
    planned: '⧖', // hourglass-ish
    locked: '\u{1F512}',
  };

  let spec = null;
  let selectedPersona = null;
  let selectedRoute = null;

  // ---- load spec.json (works offline via file:// when served, falls back to inline) ----
  async function loadSpec() {
    try {
      const res = await fetch('spec.json');
      if (!res.ok) throw new Error('fetch failed');
      return await res.json();
    } catch (err) {
      // file:// in some browsers blocks fetch — fall back to inline <script type="application/json">
      const inline = document.getElementById('inline-spec');
      if (inline) return JSON.parse(inline.textContent);
      throw err;
    }
  }

  // ---- render legend ----
  function renderLegend() {
    const legend = document.querySelector('header.top .legend');
    const personaDots = spec.personas
      .map((p) => `<span><span class="dot" style="background:${p.color}"></span>${p.label}</span>`)
      .join('');
    const statusDots = Object.entries(spec.statusLegend)
      .map(([k, v]) => `<span title="${v}">${STATUS_GLYPH[k]} ${k}</span>`)
      .join('');
    legend.innerHTML =
      personaDots +
      '<span style="border-left:1px solid #e4e4e7;padding-left:16px">' +
      statusDots +
      '</span>';
  }

  // ---- render lanes + routes ----
  function renderLanes() {
    const container = document.querySelector('.lanes');
    container.innerHTML = '';

    spec.personas.forEach((persona) => {
      // route belongs to lane if persona.id appears in calledBy
      const personaRoutes = spec.routes.filter((r) => r.calledBy.includes(persona.id));

      const lane = document.createElement('div');
      lane.className = 'lane';
      lane.dataset.personaId = persona.id;

      const header = document.createElement('div');
      header.className = 'lane-header';
      header.innerHTML = `
        <span class="swatch" style="background:${persona.color}"></span>
        <span class="label">${persona.label}</span>
        <span class="scope">${persona.scope}</span>
        <span class="count">${personaRoutes.length} routes</span>
      `;
      header.addEventListener('click', () => togglePersona(persona.id));
      lane.appendChild(header);

      const routesDiv = document.createElement('div');
      routesDiv.className = 'routes';
      personaRoutes.forEach((route) => {
        const el = document.createElement('div');
        el.className = 'route';
        if (route.calledBy.length > 1) el.classList.add('shared');
        el.dataset.routeId = route.id;
        el.dataset.personaId = persona.id;
        el.innerHTML = `
          <div class="row1">
            <span class="method ${route.method}">${route.method}</span>
            <span class="status ${route.status}" title="${route.status}">${STATUS_GLYPH[route.status]}</span>
          </div>
          <div class="path">${route.path}</div>
        `;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          selectRoute(route.id);
        });
        el.addEventListener('mouseenter', () => showRouteDetail(route));
        routesDiv.appendChild(el);
      });
      lane.appendChild(routesDiv);
      container.appendChild(lane);
    });
  }

  // ---- edges (cross-persona arrows in SVG over the lanes) ----
  function renderEdges() {
    const section = document.querySelector('section.graph');
    let svg = section.querySelector('svg.edges');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('edges');
      // marker for arrowheads
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      defs.innerHTML = `
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#71717a"/>
        </marker>
        <marker id="arrow-highlight" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#18181b"/>
        </marker>
      `;
      svg.appendChild(defs);
      section.appendChild(svg);
    }
    // clear old paths/labels (keep defs)
    Array.from(svg.querySelectorAll('path.edge, text.edge-label')).forEach((n) => n.remove());

    const rect = section.getBoundingClientRect();
    svg.setAttribute('width', rect.width);
    svg.setAttribute('height', rect.height);

    // compute lane center points
    const laneCenters = {};
    document.querySelectorAll('.lane').forEach((lane) => {
      const r = lane.getBoundingClientRect();
      laneCenters[lane.dataset.personaId] = {
        x: r.left + r.width - 32 - rect.left, // right edge
        xLeft: r.left + 32 - rect.left, // left edge
        yMid: r.top + r.height / 2 - rect.top,
      };
    });

    spec.edges.forEach((edge, i) => {
      const a = laneCenters[edge.from];
      const b = laneCenters[edge.to];
      if (!a || !b) return;

      // route on the right side; curve out and back
      const startX = a.x;
      const startY = a.yMid;
      const endX = b.x;
      const endY = b.yMid;

      // offset each edge slightly so parallel edges don't overlap
      const offset = 30 + i * 12;
      const peakX = Math.max(startX, endX) + offset;
      const peakY = (startY + endY) / 2;

      const d = `M ${startX} ${startY} C ${peakX} ${startY}, ${peakX} ${endY}, ${endX} ${endY}`;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'edge');
      path.setAttribute('marker-end', 'url(#arrow)');
      path.dataset.from = edge.from;
      path.dataset.to = edge.to;
      path.dataset.edgeIdx = i;
      svg.appendChild(path);

      // label at peak
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('class', 'edge-label');
      label.setAttribute('x', peakX + 6);
      label.setAttribute('y', peakY);
      label.dataset.from = edge.from;
      label.dataset.to = edge.to;
      label.dataset.edgeIdx = i;
      label.textContent = edge.label.length > 60 ? edge.label.slice(0, 57) + '...' : edge.label;
      svg.appendChild(label);
    });
  }

  // ---- detail panel ----
  function showRouteDetail(route) {
    const aside = document.querySelector('aside.detail');
    const callers = route.calledBy
      .map(
        (p) =>
          `<span class="pill" style="background:${personaColor(p)}1a;color:${personaColor(p)}">${p}</span>`,
      )
      .join('');
    const reads =
      (route.reads || []).map((r) => `<span class="pill">${r}</span>`).join('') ||
      '<span class="placeholder">none</span>';
    const writes =
      (route.writes || []).map((r) => `<span class="pill">${r}</span>`).join('') ||
      '<span class="placeholder">none</span>';
    const fx =
      (route.sideEffects || []).map((r) => `<span class="pill">${r}</span>`).join('') ||
      '<span class="placeholder">none</span>';
    const downstream =
      (route.downstreamConsumedBy || [])
        .map(
          (p) =>
            `<span class="pill" style="background:${personaColor(p)}1a;color:${personaColor(p)}">${p}</span>`,
        )
        .join('') || '<span class="placeholder">none</span>';

    aside.innerHTML = `
      <div class="row1">
        <span class="pill" style="background:#f4f4f5;color:#3f3f46;font-weight:600">${route.method}</span>
        <span style="font-family:ui-monospace,Menlo,monospace;font-size:13px">${route.path}</span>
      </div>
      <div class="field"><label>STATUS</label><div class="value prose">${STATUS_GLYPH[route.status]} ${route.status}</div></div>
      <div class="field"><label>NOTES</label><div class="value prose">${route.notes || ''}</div></div>
      <div class="field"><label>CALLED BY</label><div class="pills">${callers}</div></div>
      <div class="field"><label>READS</label><div class="pills">${reads}</div></div>
      <div class="field"><label>WRITES</label><div class="pills">${writes}</div></div>
      <div class="field"><label>SIDE EFFECTS</label><div class="pills">${fx}</div></div>
      <div class="field"><label>DOWNSTREAM CONSUMED BY</label><div class="pills">${downstream}</div></div>
    `;
  }

  function showPlaceholder() {
    const aside = document.querySelector('aside.detail');
    aside.innerHTML = `
      <h2>Persona-route map</h2>
      <p class="placeholder">Hover a route to see contracts. Click a persona name to dim everything else. Click a route to lock the detail panel.</p>
      <div class="field"><label>SOURCE</label><div class="value">${spec.branchSnapshot}</div></div>
      <div class="field"><label>GENERATED</label><div class="value">${spec.generatedAt}</div></div>
      <div class="field"><label>SUMMARY</label><div class="value prose">${spec.routes.length} routes across ${spec.personas.length} personas, ${spec.edges.length} cross-persona edges.</div></div>
    `;
  }

  function personaColor(id) {
    const p = spec.personas.find((x) => x.id === id);
    return p ? p.color : '#71717a';
  }

  // ---- interactions ----
  function selectRoute(routeId) {
    selectedRoute = routeId;
    const route = spec.routes.find((r) => r.id === routeId);
    if (route) showRouteDetail(route);
    document.querySelectorAll('.route').forEach((el) => {
      el.classList.toggle('selected', el.dataset.routeId === routeId);
    });
  }

  function togglePersona(personaId) {
    selectedPersona = selectedPersona === personaId ? null : personaId;
    applyDim();
  }

  function applyDim() {
    const focus = selectedPersona;
    if (!focus) {
      document
        .querySelectorAll('.lane, .route')
        .forEach((el) => el.classList.remove('dimmed', 'highlight'));
      document.querySelectorAll('svg.edges path.edge, svg.edges text.edge-label').forEach((el) => {
        el.classList.remove('highlight', 'dimmed');
      });
      return;
    }
    // collect routes connected to focus (called by OR downstream)
    const connectedRouteIds = new Set();
    spec.routes.forEach((r) => {
      if (r.calledBy.includes(focus) || (r.downstreamConsumedBy || []).includes(focus)) {
        connectedRouteIds.add(r.id);
      }
    });
    // collect personas connected via edges
    const connectedPersonas = new Set([focus]);
    spec.edges.forEach((e) => {
      if (e.from === focus) connectedPersonas.add(e.to);
      if (e.to === focus) connectedPersonas.add(e.from);
    });

    document.querySelectorAll('.lane').forEach((el) => {
      const id = el.dataset.personaId;
      el.classList.toggle('dimmed', !connectedPersonas.has(id));
      el.classList.toggle('highlight', id === focus);
    });
    document.querySelectorAll('.route').forEach((el) => {
      el.classList.toggle('dimmed', !connectedRouteIds.has(el.dataset.routeId));
    });
    document.querySelectorAll('svg.edges path.edge, svg.edges text.edge-label').forEach((el) => {
      const isMine = el.dataset.from === focus || el.dataset.to === focus;
      el.classList.toggle('highlight', isMine);
      el.classList.toggle('dimmed', !isMine);
    });
  }

  function clearSelection() {
    selectedPersona = null;
    selectedRoute = null;
    applyDim();
    document.querySelectorAll('.route.selected').forEach((el) => el.classList.remove('selected'));
    showPlaceholder();
  }

  function bindControls() {
    document.getElementById('btn-clear').addEventListener('click', clearSelection);
    window.addEventListener('resize', () => {
      renderEdges();
    });
  }

  // ---- boot ----
  loadSpec()
    .then((s) => {
      spec = s;
      renderLegend();
      renderLanes();
      // wait for layout, then draw edges
      requestAnimationFrame(() => {
        renderEdges();
        // re-draw once more after fonts/layout settle
        setTimeout(renderEdges, 100);
      });
      bindControls();
      showPlaceholder();
    })
    .catch((err) => {
      document.body.innerHTML =
        '<div style="padding:40px;font-family:sans-serif"><h2>Failed to load spec.json</h2><p>If you opened this via file://, try serving the folder with <code>python3 -m http.server</code> from <code>docs/persona-graphs/prototype-html/</code>. The inline-spec fallback is also embedded in index.html.</p><pre>' +
        err.message +
        '</pre></div>';
    });
})();
