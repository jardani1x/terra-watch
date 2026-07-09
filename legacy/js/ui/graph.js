// ============================================================
//  graph.js — link-analysis graph (Cytoscape) over the ontology
//  A second view of the same entity graph the inspector reads: nodes are
//  onto.all(), edges are onto.relations, colored by ENTITY type / RELATION type.
//  It is a peer of the globe and inspector on the selection bus — tapping a node
//  publishes selection.select(id); the bus highlights the matching node back.
//  Cytoscape is dynamically imported on first open so boot stays light.
// ============================================================

// Node fill by ENTITY type (echoes the map-layer accents where they overlap).
const TYPE_COLOR = {
  Location:         '#45e0b0',
  Asset:            '#ffd166',
  Event:            '#ff8a5a',
  MarketInstrument: '#7ec8ff',
  Alert:            '#ff5a52',
  FeedSource:       '#9aa7a2',
  Route:            '#c08bff',
  Observation:      '#74e0c0',
};

// Edge color + dash by RELATION type.
const REL_STYLE = {
  PART_OF:       { color: '#45e0b0', line: 'solid' },
  RELATED_TO:    { color: '#7ec8ff', line: 'dashed' },
  OBSERVED_FROM: { color: '#c08bff', line: 'dotted' },
  IMPACTS:       { color: '#ff5a52', line: 'solid' },
  LOCATED_AT:    { color: '#ffd166', line: 'solid' },
  NEAR:          { color: '#9aa7a2', line: 'dashed' },
};

const accentColor = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#45e0b0';

function stylesheet(accent) {
  return [
    { selector: 'node', style: {
      'background-color': '#1b2b2b', 'label': 'data(label)', 'color': '#bfe8da',
      'font-family': "'Share Tech Mono', monospace", 'font-size': 7,
      'width': 13, 'height': 13, 'border-width': 1, 'border-color': '#2c3c3c',
      'text-wrap': 'ellipsis', 'text-max-width': 64, 'text-valign': 'bottom', 'text-margin-y': 2,
    } },
    ...Object.entries(TYPE_COLOR).map(([t, c]) => ({
      selector: `node[type = "${t}"]`, style: { 'background-color': c, 'border-color': c },
    })),
    { selector: 'edge', style: {
      'width': 1, 'line-color': '#3a4a4a', 'curve-style': 'haystack', 'opacity': 0.75,
    } },
    ...Object.entries(REL_STYLE).map(([r, s]) => ({
      selector: `edge[relation = "${r}"]`, style: { 'line-color': s.color, 'line-style': s.line },
    })),
    { selector: 'node.selected', style: {
      'background-color': accent, 'border-color': accent, 'border-width': 3,
      'color': '#021410', 'font-size': 8, 'z-index': 99,
    } },
    { selector: 'node.neighbor', style: { 'border-width': 2, 'border-color': accent } },
  ];
}

/**
 * @param {Object} opts
 * @param {HTMLElement} opts.panel    the #graph-panel container (shown/hidden)
 * @param {HTMLElement} opts.host     the element Cytoscape mounts into
 * @param {HTMLElement} [opts.expandBtn]
 * @param {ReturnType<import('../ontology/model.js').createOntology>} opts.onto
 * @param {import('../core/selection.js').Selection} opts.selection
 */
export function initGraph({ panel, host, expandBtn, onto, selection }) {
  let cy = null;
  let building = null;
  const layout = { name: 'cose', animate: false, padding: 24, nodeRepulsion: 6000 };

  // Nodes = every entity; edges = relations between two present entities.
  function elements() {
    const nodes = onto.all().map((e) => ({ data: { id: e.id, label: e.label || e.id, type: e.type } }));
    const ids = new Set(nodes.map((n) => n.data.id));
    const seen = new Set();
    const edges = [];
    for (const r of onto.relations) {
      if (!ids.has(r.from) || !ids.has(r.to)) continue;
      const id = `${r.from}>${r.to}:${r.type}`;
      if (seen.has(id)) continue;
      seen.add(id);
      edges.push({ data: { id, source: r.from, target: r.to, relation: r.type } });
    }
    return [...nodes, ...edges];
  }

  function syncSelected(id) {
    if (!cy) return;
    cy.nodes('.selected').removeClass('selected');
    cy.nodes('.neighbor').removeClass('neighbor');
    if (id == null) return;
    const n = cy.getElementById(id);
    if (n.nonempty()) { n.addClass('selected'); cy.animate({ center: { eles: n } }, { duration: 220 }); }
  }

  // "Expand neighbors": highlight + fit to the ontology neighbors of the
  // currently-selected node (the whole graph is already present, so this focuses
  // attention rather than fetching more).
  function expand() {
    const id = selection.current();
    if (id == null || !cy) return;
    cy.nodes('.neighbor').removeClass('neighbor');
    let coll = cy.getElementById(id);
    for (const nb of onto.neighbors(id)) {
      const el = cy.getElementById(nb.entity.id);
      if (el.nonempty()) { el.addClass('neighbor'); coll = coll.union(el); }
    }
    if (coll.nonempty()) cy.animate({ fit: { eles: coll, padding: 48 } }, { duration: 300 });
  }

  async function build() {
    const { default: cytoscape } = await import('cytoscape');
    cy = cytoscape({ container: host, elements: elements(), style: stylesheet(accentColor()), layout });
    cy.on('tap', 'node', (evt) => selection.select(evt.target.id()));
    syncSelected(selection.current());
  }

  /** Rebuild from the current ontology (entities grow as feeds load). */
  function refresh() {
    if (!cy) return;
    cy.json({ style: stylesheet(accentColor()) });
    cy.elements().remove();
    cy.add(elements());
    cy.layout(layout).run();
    syncSelected(selection.current());
  }

  async function setVisible(on) {
    if (on) {
      panel.removeAttribute('hidden');
      if (!cy) { building = building || build(); await building; }
      else refresh();
      // Container has size only once visible — resize + fit on the next frame.
      requestAnimationFrame(() => {
        if (!cy) return;
        cy.resize();
        cy.fit(undefined, 28);
        syncSelected(selection.current());
      });
    } else {
      panel.setAttribute('hidden', '');
    }
  }

  selection.subscribe((id) => syncSelected(id));
  expandBtn?.addEventListener('click', expand);

  return { setVisible, refresh, get visible() { return !panel.hasAttribute('hidden'); } };
}
