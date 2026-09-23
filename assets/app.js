const DBD_ORANGE = '#ff6701';

const map = L.map('map', {
  zoomControl: false,
}).setView([37.5, -82], 6);

L.control.zoom({ position: 'bottomright' }).addTo(map);
map.attributionControl.setPrefix(false);

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 16,
  attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
}).addTo(map);

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 16,
}).addTo(map);

const pinIcon = L.divIcon({
  className: '',
  html: '<div class="pin-dot"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 14],
});

let allProjects = [];
let markers = [];
let labelsOn = false;
let selectedCategories = new Set();
let searchTerm = '';

function categoryOf(p) {
  return p.category && p.category.trim() ? p.category.trim() : 'Uncategorized';
}

function popupHtml(p) {
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

function withProto(url) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
function esc(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escAttr(s) { return esc(s); }
function truncate(s, n) { return s.length > n ? s.slice(0, n).trim() + '…' : s; }

function render() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  const term = searchTerm.trim().toLowerCase();

  allProjects.forEach(p => {
    if (p.lat == null || p.lng == null || isNaN(p.lat) || isNaN(p.lng)) return;
    const cat = categoryOf(p);
    if (selectedCategories.size && !selectedCategories.has(cat)) return;
    if (term) {
      const hay = `${p.title} ${p.client} ${p.location} ${p.state} ${p.category}`.toLowerCase();
      if (!hay.includes(term)) return;
    }

    const marker = L.marker([p.lat, p.lng], { icon: pinIcon }).addTo(map);
    marker.bindPopup(popupHtml(p));

    if (labelsOn) {
      marker.bindTooltip(`${p.title}${p.location ? ' · ' + p.location : ''}`, {
        permanent: true,
        direction: 'top',
        offset: [0, -12],
        className: 'map-label',
      });
    }
    markers.push(marker);
  });

  document.getElementById('visible-count').textContent = markers.length;
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

async function init() {
  try {
    const res = await fetch('data/projects.json', { cache: 'no-store' });
    const data = await res.json();
    allProjects = data.projects || [];
  } catch (e) {
    console.error('Failed to load project data', e);
    allProjects = [];
  }

  const withCoords = allProjects.filter(p => p.lat != null && p.lng != null && !isNaN(p.lat) && !isNaN(p.lng));
  document.getElementById('total-count').textContent = allProjects.length;
  document.getElementById('geocoded-count').textContent = withCoords.length;

  buildFilters(allProjects);
  render();

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
}

async function exportMap() {
  const btn = document.getElementById('export-btn');
  btn.textContent = 'Exporting…';
  btn.disabled = true;
  try {
    const target = document.querySelector('.map-wrap');
    const canvas = await html2canvas(target, { useCORS: true, backgroundColor: '#1b1b1b' });
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
