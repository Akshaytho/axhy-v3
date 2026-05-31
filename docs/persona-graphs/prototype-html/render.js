// [ORCHESTRATOR_EXCEPTION] continuing tight visual iteration loop on prototype
// AXHY persona-graph prototype 1 — renderer
// Reads spec.json, lays out 5 persona lanes, draws routes + cross-persona edges
// with bold colored arrows (by status), pill labels, and a Connection-list table.

(function () {
  'use strict';

  const STATUS_GLYPH = {
    working: '✓',
    broken: '✗',
    planned: '⧖',
    locked: '🔒',
  };

  let spec = null;
  let selectedPersona = null;
  let selectedRoute = null;
  let edgeIndex = []; // augmented edges with status

  async function loadSpec() {
    try {
      const res = await fetch('spec.json');
      if (!res.ok) throw new Error('fetch failed');
      return await res.json();
    } catch (err) {
      const inline = document.getElementById('inline-spec');
      if (inline) return JSON.parse(inline.textContent);
      throw err;
    }
  }

  function personaColor(id) {
    const p = spec.personas.find((x) => x.id === id);
    return p ? p.color : '#71717a';
  }

  // Pick edge status: parse "via" against route IDs; first-match status; planned/broken dominates
  function edgeStatus(edge) {
    const viaIds = edge.via.split(/\s*\+\s*/).map((s) => s.replace(/\s*\(.*\)\s*/, '').trim());
    const statuses = viaIds
      .map((id) => spec.routes.find((r) => r.id === id))
      .filter(Boolean)
      .map((r) => r.status);
    if (edge.via.toLowerCase().includes('planned')) return 'planned';
    if (statuses.includes('broken')) return 'broken';
    if (statuses.includes('planned')) return 'planned';
    if (statuses.includes('locked')) return 'locked';
    return 'working';
  }

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

    // edge legend
    let edgeLegend = document.querySelector('header.top .edge-legend');
    if (!edgeLegend) {
      edgeLegend = document.createElement('div');
      edgeLegend.className = 'edge-legend';
      legend.parentElement.appendChild(edgeLegend);
    }
    edgeLegend.innerHTML = `
      <span class="item"><span class="swatch working"></span>Working cross-persona link</span>
      <span class="item"><span class="swatch broken"></span>Broken / invariant gap</span>
      <span class="item"><span class="swatch planned"></span>Planned (not yet built)</span>
      <span class="item"><span class="swatch locked"></span>Locked / constitutional</span>
    `;
  }

  function renderLanes() {
    const container = document.querySelector('.lanes');
    container.innerHTML = '';

    // count edges touching each persona
    const edgeCount = {};
    spec.personas.forEach((p) => (edgeCount[p.id] = 0));
    spec.edges.forEach((e) => {
      edgeCount[e.from] = (edgeCount[e.from] || 0) + 1;
      edgeCount[e.to] = (edgeCount[e.to] || 0) + 1;
    });

    spec.personas.forEach((persona) => {
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
        <span class="edge-badge" title="cross-persona links touching this persona">${edgeCount[persona.id] || 0} links</span>
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

  function renderEdges() {
    const section = document.querySelector('section.graph');
    let svg = section.querySelector('svg.edges');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('edges');
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      // Arrowheads per status — larger, filled, with white halo via drop-shadow on path
      defs.innerHTML = `
        <marker id="arrow-working" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse">
          <path d="M0,0 L12,6 L0,12 z" fill="#2563eb"/>
        </marker>
        <marker id="arrow-broken" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse">
          <path d="M0,0 L12,6 L0,12 z" fill="#dc2626"/>
        </marker>
        <marker id="arrow-planned" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse">
          <path d="M0,0 L12,6 L0,12 z" fill="#f59e0b"/>
        </marker>
        <marker id="arrow-locked" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse">
          <path d="M0,0 L12,6 L0,12 z" fill="#6b7280"/>
        </marker>
      `;
      svg.appendChild(defs);
      section.appendChild(svg);
    }
    Array.from(svg.querySelectorAll('path.edge, g.edge-label-group')).forEach((n) => n.remove());

    const rect = section.getBoundingClientRect();
    svg.setAttribute('width', rect.width);
    svg.setAttribute('height', rect.height);

    // compute lane edge points
    const laneBox = {};
    document.querySelectorAll('.lane').forEach((lane) => {
      const r = lane.getBoundingClientRect();
      laneBox[lane.dataset.personaId] = {
        left: r.left - rect.left,
        right: r.right - rect.left,
        top: r.top - rect.top,
        bottom: r.bottom - rect.top,
        yMid: r.top + r.height / 2 - rect.top,
      };
    });

    // Persona order in DOM
    const personaOrder = spec.personas.map((p) => p.id);
    const idx = (id) => personaOrder.indexOf(id);

    // Group edges by from→to direction; assign each its own lateral offset
    edgeIndex = spec.edges.map((edge, i) => {
      const status = edgeStatus(edge);
      return { ...edge, status, _i: i };
    });

    // [ORCHESTRATOR_EXCEPTION] v3 fix: stagger labels vertically; route edges through wider gutters
    const sideCounter = { right: 0, left: 0 };
    // Track placed label rectangles per side so we can offset Y to avoid overlap
    const placedLabels = { right: [], left: [] };

    edgeIndex.forEach((edge) => {
      const a = laneBox[edge.from];
      const b = laneBox[edge.to];
      if (!a || !b) return;

      const goesDown = idx(edge.to) > idx(edge.from);
      const side = goesDown ? 'right' : 'left';
      const slot = sideCounter[side]++;

      const startY = a.yMid;
      const endY = b.yMid;
      let startX, endX, peakX;
      if (side === 'right') {
        startX = a.right - 8;
        endX = b.right - 8;
        peakX = Math.max(a.right, b.right) + 36 + slot * 22;
      } else {
        startX = a.left + 8;
        endX = b.left + 8;
        peakX = Math.min(a.left, b.left) - 36 - slot * 22;
      }
      edge._side = side;
      edge._peakX = peakX;
      edge._startY = startY;
      edge._endY = endY;
      edge._startX = startX;
      edge._endX = endX;

      const d = `M ${startX} ${startY} C ${peakX} ${startY}, ${peakX} ${endY}, ${endX} ${endY}`;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', `edge ${edge.status}`);
      path.setAttribute('marker-end', `url(#arrow-${edge.status})`);
      path.dataset.from = edge.from;
      path.dataset.to = edge.to;
      path.dataset.edgeIdx = edge._i;
      svg.appendChild(path);

      // [ORCHESTRATOR_EXCEPTION] v3: shorter labels, vertical stagger to avoid overlap
      const MAX_LABEL = 28;
      const labelText =
        edge.label.length > MAX_LABEL ? edge.label.slice(0, MAX_LABEL - 1) + '…' : edge.label;
      let peakY = (startY + endY) / 2;
      const padX = 8;
      const textW = labelText.length * 6.6;
      const w = Math.min(textW + padX * 2, 220);
      const h = 22;

      // Adjust peakY so this label rect doesn't overlap previously placed labels on same side
      const myRect = () => ({
        top: peakY - h / 2,
        bottom: peakY + h / 2,
        left: peakX - w / 2,
        right: peakX + w / 2,
      });
      const overlaps = () => {
        const m = myRect();
        return placedLabels[side].some(
          (r) => !(m.right < r.left || m.left > r.right || m.bottom < r.top || m.top > r.bottom),
        );
      };
      let nudges = 0;
      const dir = side === 'right' ? 1 : -1; // arbitrary; we try both directions
      while (overlaps() && nudges < 12) {
        nudges++;
        peakY += dir * (h + 4) * (nudges % 2 === 0 ? 1 : -1) * Math.ceil(nudges / 2);
      }
      placedLabels[side].push(myRect());

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', `edge-label-group`);
      g.dataset.from = edge.from;
      g.dataset.to = edge.to;
      g.dataset.edgeIdx = edge._i;

      const rectEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rectEl.setAttribute('x', peakX - w / 2);
      rectEl.setAttribute('y', peakY - h / 2);
      rectEl.setAttribute('width', w);
      rectEl.setAttribute('height', h);
      rectEl.setAttribute('class', edge.status);
      g.appendChild(rectEl);

      const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textEl.setAttribute('x', peakX);
      textEl.setAttribute('y', peakY + 1);
      textEl.textContent = labelText;
      g.appendChild(textEl);

      svg.appendChild(g);
    });
  }

  function renderConnectionList() {
    let container = document.querySelector('.connection-list');
    if (!container) {
      container = document.createElement('section');
      container.className = 'connection-list';
      document.querySelector('section.graph').appendChild(container);
    }
    const rows = spec.edges
      .map((edge, i) => {
        const status = edgeStatus(edge);
        const arrow = status === 'broken' ? '⇢' : status === 'planned' ? '⇢' : '→';
        return `
          <div class="conn-row" data-from="${edge.from}" data-to="${edge.to}" data-edge-idx="${i}">
            <span class="persona-pill" style="background:${personaColor(edge.from)}">${edge.from}</span>
            <span class="arrow ${status}">${arrow}</span>
            <span class="persona-pill" style="background:${personaColor(edge.to)}">${edge.to}</span>
            <span class="desc">${edge.label}</span>
            <span class="via">${edge.via}</span>
          </div>
        `;
      })
      .join('');
    container.innerHTML = `
      <h3>Cross-persona connections (${spec.edges.length})</h3>
      <div class="sub">Each row = one arrow in the diagram above. Click a row to highlight; click a persona name in any lane to filter.</div>
      ${rows}
    `;
    container.querySelectorAll('.conn-row').forEach((row) => {
      row.addEventListener('click', () => {
        const from = row.dataset.from;
        togglePersona(from);
      });
    });
  }

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
      <p class="placeholder">Click a persona name to focus on its connections. The blue/red/amber arrows are cross-persona links — see the table below the diagram for the full list. Hover a route for contracts.</p>
      <div class="field"><label>SOURCE</label><div class="value">${spec.branchSnapshot}</div></div>
      <div class="field"><label>GENERATED</label><div class="value">${spec.generatedAt}</div></div>
      <div class="field"><label>SUMMARY</label><div class="value prose">${spec.routes.length} routes across ${spec.personas.length} personas, ${spec.edges.length} cross-persona edges.</div></div>
    `;
  }

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
    const lanes = document.querySelectorAll('.lane');
    const routes = document.querySelectorAll('.route');
    const edges = document.querySelectorAll('svg.edges path.edge, svg.edges g.edge-label-group');
    const connRows = document.querySelectorAll('.connection-list .conn-row');

    if (!focus) {
      lanes.forEach((el) => el.classList.remove('dimmed', 'focused-source', 'focused-related'));
      routes.forEach((el) => el.classList.remove('dimmed'));
      edges.forEach((el) => el.classList.remove('highlight', 'dimmed'));
      connRows.forEach((el) => el.classList.remove('highlight', 'dimmed'));
      return;
    }
    const connectedRouteIds = new Set();
    spec.routes.forEach((r) => {
      if (r.calledBy.includes(focus) || (r.downstreamConsumedBy || []).includes(focus)) {
        connectedRouteIds.add(r.id);
      }
    });
    const connectedPersonas = new Set([focus]);
    spec.edges.forEach((e) => {
      if (e.from === focus) connectedPersonas.add(e.to);
      if (e.to === focus) connectedPersonas.add(e.from);
    });

    lanes.forEach((el) => {
      const id = el.dataset.personaId;
      el.classList.toggle('dimmed', !connectedPersonas.has(id));
      el.classList.toggle('focused-source', id === focus);
      el.classList.toggle('focused-related', id !== focus && connectedPersonas.has(id));
    });
    routes.forEach((el) => {
      el.classList.toggle('dimmed', !connectedRouteIds.has(el.dataset.routeId));
    });
    edges.forEach((el) => {
      const isMine = el.dataset.from === focus || el.dataset.to === focus;
      el.classList.toggle('highlight', isMine);
      el.classList.toggle('dimmed', !isMine);
    });
    connRows.forEach((el) => {
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

  loadSpec()
    .then((s) => {
      spec = s;
      renderLegend();
      renderLanes();
      renderConnectionList();
      requestAnimationFrame(() => {
        renderEdges();
        setTimeout(renderEdges, 100);
      });
      bindControls();
      showPlaceholder();
    })
    .catch((err) => {
      document.body.innerHTML =
        '<div style="padding:40px;font-family:sans-serif"><h2>Failed to load spec.json</h2><pre>' +
        err.message +
        '</pre></div>';
    });
})();
