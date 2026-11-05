// All-products page: search, filters and sort. Filter state lives in the URL so results can be shared and survive reloads.
(async function () {
  const { $, $$, esc, card, fmt } = A;
  A.mountChrome('shop');
  $('#filtersClose').innerHTML = A.ICON.close;
  $('#searchBox').insertAdjacentHTML('afterbegin', A.ICON.search);

  let products;
  try { products = await A.products(); }
  catch { $('#grid').innerHTML = '<div class="empty"><h3>Products could not be loaded</h3><p>Please refresh the page.</p></div>'; return; }

  const CATS = ['Skincare', 'Makeup', 'Hair', 'Fragrance'];
  const brands = [...new Set(products.map(p => p.brand))].sort((a, b) => a.localeCompare(b));
  const STEP = 10;
  const floor = Math.floor(Math.min(...products.map(p => p.price), 0) / STEP) * STEP;
  const ceil = Math.ceil(Math.max(...products.map(p => p.price), STEP) / STEP) * STEP;

  const qp = new URLSearchParams(location.search);
  const num = (k, d, lo, hi) => { const n = Number(qp.get(k)); return qp.has(k) && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const F = {
    q: qp.get('q') || '',
    category: CATS.includes(qp.get('category')) ? qp.get('category') : '',
    brands: qp.getAll('brand').filter(b => brands.includes(b)),
    min: num('min', floor, floor, ceil), max: num('max', ceil, floor, ceil),
    rating: num('rating', 0, 0, 5),
    stock: qp.has('stock'), sale: qp.has('sale'), saved: qp.has('saved'),
    sort: qp.get('sort') || 'featured',
  };

  function syncUrl() {
    const p = new URLSearchParams();
    if (F.q) p.set('q', F.q);
    if (F.category) p.set('category', F.category);
    F.brands.forEach(b => p.append('brand', b));
    if (F.min > floor) p.set('min', F.min);
    if (F.max < ceil) p.set('max', F.max);
    if (F.rating) p.set('rating', F.rating);
    if (F.stock) p.set('stock', 1);
    if (F.sale) p.set('sale', 1);
    if (F.saved) p.set('saved', 1);
    if (F.sort !== 'featured') p.set('sort', F.sort);
    const s = p.toString();
    history.replaceState(null, '', s ? `?${s}` : location.pathname);
  }

  /** Products matching F, optionally ignoring one filter (used for the facet counts). */
  function match(p, skip) {
    const q = F.q.trim().toLowerCase();
    if (q) {
      const hay = `${p.name} ${p.brand} ${p.category}`.toLowerCase();
      if (!q.split(/\s+/).every(w => hay.includes(w))) return false;
    }
    if (skip !== 'category' && F.category && p.category !== F.category) return false;
    if (skip !== 'brand' && F.brands.length && !F.brands.includes(p.brand)) return false;
    if (p.price < F.min || p.price > F.max) return false;
    if (F.rating && !(p.rating >= F.rating)) return false;
    if (F.stock && p.stock <= 0) return false;
    if (F.sale && !p.compare_at) return false;
    if (F.saved && !A.saved().includes(p.id)) return false;
    return true;
  }
  const SORTS = {
    featured: (a, b) => b.featured - a.featured || a.id - b.id,
    new: (a, b) => b.created_at.localeCompare(a.created_at),
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    rating: (a, b) => (b.rating || 0) - (a.rating || 0),
    name: (a, b) => a.name.localeCompare(b.name),
  };

  // Build static controls once
  const pMin = $('#pMin'), pMax = $('#pMax');
  [pMin, pMax].forEach(el => { el.min = floor; el.max = ceil; el.step = STEP; });
  pMin.value = F.min; pMax.value = F.max;
  $('#q').value = F.q;
  $('#fStock').checked = F.stock; $('#fSale').checked = F.sale; $('#fSaved').checked = F.saved;
  $('#sort').value = SORTS[F.sort] ? F.sort : (F.sort = 'featured');
  $('#fRating').innerHTML = [[0, 'Any'], [4, '4★ & up'], [4.5, '4.5★ & up']].map(([v, l]) => `<button class="chip" data-rating="${v}">${l}</button>`).join('');

  $('#fRating').parentElement.hidden = !products.some(p => p.rating); // nothing to filter until products have ratings

  let firstRender = true;
  function render() {
    // Facets, with counts reflecting the other active filters
    $('#fCat').innerHTML = [['', 'All'], ...CATS.map(c => [c, c])].map(([v, l]) => {
      const n = products.filter(p => match(p, 'category') && (!v || p.category === v)).length;
      return `<button class="chip${F.category === v ? ' on' : ''}" data-cat="${v}" aria-pressed="${F.category === v}">${l} <span style="opacity:.65">${n}</span></button>`;
    }).join('');
    $('#fBrand').innerHTML = brands.map(b => {
      const n = products.filter(p => match(p, 'brand') && p.brand === b).length;
      return `<label class="chk"><input type="checkbox" data-brand="${esc(b)}" ${F.brands.includes(b) ? 'checked' : ''}> ${esc(b)} <span class="n">${n}</span></label>`;
    }).join('');
    $$('[data-rating]').forEach(c => { const on = Number(c.dataset.rating) === F.rating; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });

    // Price slider
    $('#pMinL').textContent = fmt(F.min); $('#pMaxL').textContent = fmt(F.max);
    const span = Math.max(1, ceil - floor), fill = $('#pFill');
    fill.style.left = ((F.min - floor) / span) * 100 + '%';
    fill.style.right = (100 - ((F.max - floor) / span) * 100) + '%';

    // Results
    const list = products.filter(p => match(p)).sort(SORTS[F.sort]);
    const label = `${list.length} product${list.length === 1 ? '' : 's'}`;
    $('#count').textContent = label;
    $('#filtersApply').textContent = `Show ${label}`;
    $('#grid').innerHTML = list.length ? list.map(card).join('')
      : `<div class="empty"><h3>No products match</h3><p>Try removing a filter or searching for something else.</p><p style="margin-top:14px"><button class="btn dk" data-clear>Clear all filters</button></p></div>`;
    if (firstRender) firstRender = false;

    // Active filter pills
    const pills = [];
    if (F.q) pills.push(['q', `“${F.q}”`]);
    if (F.category) pills.push(['category', F.category]);
    F.brands.forEach(b => pills.push([`brand:${b}`, b]));
    if (F.min > floor || F.max < ceil) pills.push(['price', `${fmt(F.min)} to ${fmt(F.max)}`]);
    if (F.rating) pills.push(['rating', `${F.rating}★ & up`]);
    if (F.stock) pills.push(['stock', 'In stock']);
    if (F.sale) pills.push(['sale', 'On sale']);
    if (F.saved) pills.push(['saved', 'Saved']);
    $('#activeF').innerHTML = pills.map(([k, l]) => `<button class="pill" data-rm="${esc(k)}" aria-label="Remove filter ${esc(l)}">${esc(l)} ×</button>`).join('')
      + (pills.length > 1 ? '<button class="pill clear" data-clear>Clear all</button>' : '');
    syncUrl();
  }

  function clearAll() {
    Object.assign(F, { q: '', category: '', brands: [], min: floor, max: ceil, rating: 0, stock: false, sale: false, saved: false });
    $('#q').value = ''; pMin.value = floor; pMax.value = ceil;
    $('#fStock').checked = $('#fSale').checked = $('#fSaved').checked = false;
    render();
  }

  $('#q').addEventListener('input', e => { F.q = e.target.value; render(); });
  $('#sort').addEventListener('change', e => { F.sort = e.target.value; render(); });
  pMin.addEventListener('input', () => { F.min = Math.min(Number(pMin.value), F.max); pMin.value = F.min; render(); });
  pMax.addEventListener('input', () => { F.max = Math.max(Number(pMax.value), F.min); pMax.value = F.max; render(); });
  for (const [id, key] of [['#fStock', 'stock'], ['#fSale', 'sale'], ['#fSaved', 'saved']]) $(id).addEventListener('change', e => { F[key] = e.target.checked; render(); });

  document.addEventListener('click', e => {
    const c = e.target.closest('[data-cat]');
    if (c) { F.category = c.dataset.cat; render(); return; }
    const r = e.target.closest('[data-rating]');
    if (r) { F.rating = Number(r.dataset.rating); render(); return; }
    const rm = e.target.closest('[data-rm]');
    if (rm) {
      const k = rm.dataset.rm;
      if (k === 'q') { F.q = ''; $('#q').value = ''; }
      else if (k === 'category') F.category = '';
      else if (k.startsWith('brand:')) F.brands = F.brands.filter(b => b !== k.slice(6));
      else if (k === 'price') { F.min = floor; F.max = ceil; pMin.value = floor; pMax.value = ceil; }
      else if (k === 'rating') F.rating = 0;
      else { F[k] = false; $({ stock: '#fStock', sale: '#fSale', saved: '#fSaved' }[k]).checked = false; }
      render(); return;
    }
    if (e.target.closest('[data-clear]')) clearAll();
  });
  $('#fBrand').addEventListener('change', e => {
    const b = e.target.dataset.brand; if (!b) return;
    F.brands = e.target.checked ? [...F.brands, b] : F.brands.filter(x => x !== b);
    render();
  });
  document.addEventListener('alola:saved', () => { if (F.saved) render(); });

  // Mobile filter sheet
  const sheet = on => { $('#filters').classList.toggle('show', on); $('#overlay').classList.toggle('on', on); };
  $('#filtersOpen').onclick = () => sheet(true);
  $('#filtersClose').onclick = $('#filtersApply').onclick = () => sheet(false);
  $('#overlay').addEventListener('click', () => sheet(false));
  document.addEventListener('alola:esc', () => sheet(false));

  render();
  if (qp.has('focus')) $('#q').focus();
})();
