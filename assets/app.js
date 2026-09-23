const OFFICE = { lat: 36.1980505, lng: -81.6554484, name: 'Destination by Design HQ', address: '136 Furman Road, Suite 6, Boone, NC 28607' };

const STATE_NAME_TO_ABBR = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA','Colorado':'CO',
  'Connecticut':'CT','Delaware':'DE','District of Columbia':'DC','Florida':'FL','Georgia':'GA',
  'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY',
  'Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN',
  'Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH',
  'New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND',
  'Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Puerto Rico':'PR','Rhode Island':'RI',
  'South Carolina':'SC','South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
  'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
};

const map = L.map('map', {
  zoomControl: false,
}).setView([37.5, -82], 6);

L.control.zoom({ position: 'bottomright' }).addTo(map);
map.attributionControl.setPrefix(false);

const TILE_SETS = {
  dark: {
    base: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    ref: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
  },
  light: {
    base: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    ref: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
  },
};

const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
let tileBaseLayer = null;
let tileRefLayer = null;

function isDarkMode() {
  const override = localStorage.getItem('dbd-map-theme');
  if (override === 'light') return false;
  if (override === 'dark') return true;
  return darkModeQuery.matches;
}

function applyTileTheme() {
  const set = isDarkMode() ? TILE_SETS.dark : TILE_SETS.light;
  if (tileBaseLayer) map.removeLayer(tileBaseLayer);
  if (tileRefLayer) map.removeLayer(tileRefLayer);
  tileBaseLayer = L.tileLayer(set.base, {
    maxZoom: 16,
    attribution: '&copy; <a href="https://www.esri.com">Esri</a> &middot; State boundaries: US Census Bureau',
  }).addTo(map);
  tileRefLayer = L.tileLayer(set.ref, { maxZoom: 16 }).addTo(map);
}

function applyThemeAttribute() {
  const override = localStorage.getItem('dbd-map-theme');
  if (override === 'light' || override === 'dark') {
    document.documentElement.setAttribute('data-theme', override);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function setTheme(theme) {
  // theme: 'light' | 'dark'
  localStorage.setItem('dbd-map-theme', theme);
  applyThemeAttribute();
  applyTileTheme();
  updateThemeToggleIcon();
}

function updateThemeToggleIcon() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.classList.toggle('is-dark', isDarkMode());
}

applyThemeAttribute();
applyTileTheme();
darkModeQuery.addEventListener('change', () => {
  if (!localStorage.getItem('dbd-map-theme')) {
    applyTileTheme();
    updateThemeToggleIcon();
  }
});

function pinIcon(count) {
  const badge = count > 1 ? `<span class="pin-badge">${count > 99 ? '99+' : count}</span>` : '';
  return L.divIcon({
    className: '',
    html: `<div class="pin-dot">${badge}</div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 14],
  });
}

const officeIcon = L.divIcon({
  className: '',
  html: '<div class="pin-office"><img src="assets/logo-icon.svg" alt="" /></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 20],
});

let allProjects = [];
let markers = [];
let labelsOn = false;
let selectedCategories = new Set();
let searchTerm = '';
let statesGeoJson = null;
let choroplethLayer = null;

function categoryOf(p) {
  return p.category && p.category.trim() ? p.category.trim() : 'Uncategorized';
}

function passesFilters(p) {
  const cat = categoryOf(p);
  if (selectedCategories.size && !selectedCategories.has(cat)) return false;
  const term = searchTerm.trim().toLowerCase();
  if (term) {
    const hay = `${p.title} ${p.client} ${p.location} ${p.state} ${p.category}`.toLowerCase();
    if (!hay.includes(term)) return false;
  }
  return true;
}

function computeStateCounts() {
  const counts = {};
  allProjects.forEach(p => {
    if (!p.state || !passesFilters(p)) return;
    counts[p.state] = (counts[p.state] || 0) + 1;
  });
  return counts;
}

function stateFillOpacity(rank, maxRank) {
  // Rank-based, not value-based: states are ordered strictly by how many
  // projects they have, then spread evenly across the opacity range by
  // rank position. This ignores the size of the gap between counts (e.g.
  // NC's 208 vs VA's 24) entirely -- a magnitude-based scale (linear, sqrt,
  // log) always lets one extreme outlier compress everyone else into a
  // narrow band. Rank order guarantees N states with data render as N
  // visibly distinct, evenly-spaced tiers no matter how skewed the counts are.
  const floor = 0.06;
  const intensity = 1 - rank / (maxRank || 1);
  return floor + (0.85 - floor) * intensity;
}

// Above this zoom level the choropleth fades out entirely -- once you're
// zoomed into a state/metro cluster, a flat state-colored fill just covers
// the basemap and pins you're trying to look at.
const CHOROPLETH_ZOOM_THRESHOLD = 8;
let currentChoroplethStyleFn = null;

function choroplethStyleFn(counts, rankByCount, maxRank) {
  return (feature) => {
    const abbr = STATE_NAME_TO_ABBR[feature.properties.name];
    const count = counts[abbr] || 0;
    const zoomedIn = map.getZoom() >= CHOROPLETH_ZOOM_THRESHOLD;
    return {
      fillColor: '#ff6701',
      fillOpacity: (!zoomedIn && count) ? stateFillOpacity(rankByCount.get(count), maxRank) : 0,
      color: zoomedIn ? 'rgba(255,103,1,0)' : 'rgba(255,103,1,.45)',
      weight: 1,
      interactive: !zoomedIn && !!count,
    };
  };
}

function renderChoropleth() {
  if (!statesGeoJson) return;
  if (choroplethLayer) map.removeLayer(choroplethLayer);

  const counts = computeStateCounts();
  const uniqueCounts = [...new Set(Object.values(counts))].sort((a, b) => b - a);
  const rankByCount = new Map(uniqueCounts.map((c, i) => [c, i]));
  const maxRank = Math.max(1, uniqueCounts.length - 1);
  currentChoroplethStyleFn = choroplethStyleFn(counts, rankByCount, maxRank);

  choroplethLayer = L.geoJSON(statesGeoJson, {
    style: currentChoroplethStyleFn,
    onEachFeature: (feature, layer) => {
      const abbr = STATE_NAME_TO_ABBR[feature.properties.name];
      const count = counts[abbr] || 0;
      if (!count) return;
      layer.bindTooltip(`${feature.properties.name} — ${count} project${count === 1 ? '' : 's'}`, {
        sticky: true,
        className: 'map-label',
      });
    },
  }).addTo(map);
}

map.on('zoomend', () => {
  if (choroplethLayer && currentChoroplethStyleFn) {
    choroplethLayer.setStyle(currentChoroplethStyleFn);
  }
});

function projectPopupInner(p) {
  const links = [];
  if (p.websiteLink) links.push(`<a href="${escAttr(withProto(p.websiteLink))}" target="_blank" rel="noopener">Website</a>`);
  if (p.planLink) links.push(`<a href="${escAttr(withProto(p.planLink))}" target="_blank" rel="noopener">Plan/Proposal</a>`);
  const contact = [p.contactName, p.contactEmail].filter(Boolean).join(' — ');
  return `
    <div class="popup-title">${esc(p.title)}</div>
    <div class="popup-loc">${esc([p.location, p.state].filter(Boolean).join(', '))}</div>
    ${p.category ? `<div class="popup-tag">${esc(p.category)}</div>` : ''}
    ${p.narrative ? `<div class="popup-narrative">${esc(truncate(p.narrative, 260))}</div>` : ''}
    ${contact ? `<div class="popup-contact">${esc(contact)}</div>` : ''}
    ${links.length ? `<div class="popup-links">${links.join('')}</div>` : ''}
  `;
}

function popupHtml(group) {
  if (group.length === 1) return projectPopupInner(group[0]);
  const loc = [group[0].location, group[0].state].filter(Boolean).join(', ');
  const items = group.map(p => `<div class="popup-group-item">${projectPopupInner(p)}</div>`).join('');
  return `
    <div class="popup-group-header">${group.length} projects near ${esc(loc)}</div>
    <div class="popup-group-list">${items}</div>
  `;
}

function withProto(url) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
function esc(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escAttr(s) { return esc(s); }
function truncate(s, n) { return s.length > n ? s.slice(0, n).trim() + '…' : s; }

function shortLocation(p) {
  let loc = (p.location || '').replace(/\s+(City|Town|Village|County)$/i, '').trim();
  if (!loc) return p.state || '';
  return p.state ? `${loc}, ${p.state}` : loc;
}

function coordKey(p) {
  return `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
}

function render() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  const groups = new Map();
  allProjects.forEach(p => {
    if (p.lat == null || p.lng == null || isNaN(p.lat) || isNaN(p.lng)) return;
    if (!passesFilters(p)) return;
    const key = coordKey(p);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });

  let visibleCount = 0;
  groups.forEach(group => {
    const p0 = group[0];
    visibleCount += group.length;

    const marker = L.marker([p0.lat, p0.lng], { icon: pinIcon(group.length) }).addTo(map);
    marker.bindPopup(popupHtml(group));

    if (labelsOn) {
      const label = group.length > 1 ? `${shortLocation(p0)} (${group.length})` : shortLocation(p0);
      marker.bindTooltip(label, {
        permanent: true,
        direction: 'top',
        offset: [0, -12],
        className: 'map-label',
      });
    }
    markers.push(marker);
  });

  document.getElementById('visible-count').textContent = visibleCount;
  renderChoropleth();
}

function buildFilters(projects) {
  const counts = {};
  projects.forEach(p => {
    const cat = categoryOf(p);
    counts[cat] = (counts[cat] || 0) + 1;
  });
  const wrap = document.getElementById('category-filters');
  wrap.innerHTML = '';
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      const chip = document.createElement('div');
      chip.className = 'filter-chip';
      chip.innerHTML = `<span>${esc(cat)}</span><span class="count">${count}</span>`;
      chip.addEventListener('click', () => {
        if (selectedCategories.has(cat)) {
          selectedCategories.delete(cat);
          chip.classList.remove('selected');
        } else {
          selectedCategories.add(cat);
          chip.classList.add('selected');
        }
        render();
      });
      wrap.appendChild(chip);
    });
}

function addOfficeMarker() {
  const marker = L.marker([OFFICE.lat, OFFICE.lng], { icon: officeIcon, zIndexOffset: 1000 }).addTo(map);
  marker.bindPopup(`
    <div class="popup-title">${esc(OFFICE.name)}</div>
    <div class="popup-loc">${esc(OFFICE.address)}</div>
  `);
  document.getElementById('office-watermark').addEventListener('click', () => {
    map.flyTo([OFFICE.lat, OFFICE.lng], 15, { duration: 1.1 });
    marker.openPopup();
  });
}

async function init() {
  try {
    const [projRes, stateRes] = await Promise.all([
      fetch('data/projects.json', { cache: 'no-store' }),
      fetch('data/us-states.json', { cache: 'no-store' }),
    ]);
    const data = await projRes.json();
    allProjects = data.projects || [];
    statesGeoJson = await stateRes.json();
  } catch (e) {
    console.error('Failed to load project or state boundary data', e);
    allProjects = allProjects || [];
  }

  const withCoords = allProjects.filter(p => p.lat != null && p.lng != null && !isNaN(p.lat) && !isNaN(p.lng));
  document.getElementById('total-count').textContent = allProjects.length;
  document.getElementById('geocoded-count').textContent = withCoords.length;

  buildFilters(allProjects);
  render();
  addOfficeMarker();

  document.getElementById('label-toggle').addEventListener('click', (e) => {
    labelsOn = !labelsOn;
    e.currentTarget.classList.toggle('on', labelsOn);
    render();
  });

  document.getElementById('search').addEventListener('input', (e) => {
    searchTerm = e.target.value;
    render();
  });

  document.getElementById('clear-filters').addEventListener('click', () => {
    selectedCategories.clear();
    searchTerm = '';
    document.getElementById('search').value = '';
    document.querySelectorAll('.filter-chip.selected').forEach(c => c.classList.remove('selected'));
    render();
  });

  document.getElementById('export-btn').addEventListener('click', exportMap);

  document.getElementById('theme-toggle').addEventListener('click', () => {
    setTheme(isDarkMode() ? 'light' : 'dark');
  });
  updateThemeToggleIcon();

  const hamburger = document.getElementById('hamburger-toggle');
  const actionsMenu = document.getElementById('header-actions');
  hamburger.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = actionsMenu.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  actionsMenu.addEventListener('click', (e) => {
    if (e.target.closest('button')) {
      actionsMenu.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('click', (e) => {
    if (!actionsMenu.contains(e.target) && e.target !== hamburger && !hamburger.contains(e.target)) {
      actionsMenu.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    }
  });
}

async function exportMap() {
  const btn = document.getElementById('export-btn');
  btn.textContent = 'Exporting…';
  btn.disabled = true;
  try {
    const target = document.querySelector('.map-wrap');
    const bg = getComputedStyle(document.body).getPropertyValue('--bg-map-fallback').trim() || '#1b1b1b';
    const canvas = await html2canvas(target, { useCORS: true, backgroundColor: bg });
    const link = document.createElement('a');
    link.download = `dbd-project-map-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (e) {
    console.error('Export failed', e);
    alert('Export failed — see console for details.');
  } finally {
    btn.textContent = 'Export PNG';
    btn.disabled = false;
  }
}

init();
