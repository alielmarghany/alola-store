// Landing page.
(async function () {
  const { $, $$, esc, card, url } = A;
  A.mountChrome('home');
  $$('[data-sprig]').forEach(el => el.insertAdjacentHTML('afterbegin', alolaSprig()));

  // Hero boxes: the content set in the dashboard's Home page tab, or the built-in design.
  // The last version is kept in the browser so a returning visitor doesn't see the old one flash first.
  const HERO_KEY = 'alola_hero', previewing = new URLSearchParams(location.search).get('hero') === 'preview';
  const readJSON = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  let heroData = previewing ? readJSON('alola_hero_preview') : readJSON(HERO_KEY), heroPics = {}, products = null;
  function drawHero() {
    heroPics = AlolaHero.render(heroData);
    const wreath = $('#stageWreath'); if (wreath) wreath.innerHTML = alolaWreath({ leaves: 32 }); // a banner box has no wreath
    drawHeroArt();
  }
  // Drawings of real catalogue items fill the picture spots that have no custom picture.
  function drawHeroArt() {
    if (!products) return;
    const inStock = products.filter(p => p.stock > 0);
    const heroProduct = inStock.find(p => p.art === 'perfume') || inStock[0];
    if (heroProduct && !heroPics.main) $('#heroPack').innerHTML = alolaArt(heroProduct);
    if (products[3] && !heroPics.t2) $('#artT2').innerHTML = alolaArt(products[3]);
    if (products[1] && !heroPics.t3) $('#artT3').innerHTML = alolaArt(products[1]);
  }
  drawHero();
  if (previewing) A.toast('Preview: this is how the home page looks with your unsaved changes');
  else A.config().then(c => {
    try { c.hero ? localStorage.setItem(HERO_KEY, JSON.stringify(c.hero)) : localStorage.removeItem(HERO_KEY); } catch {}
    if (JSON.stringify(c.hero) !== JSON.stringify(heroData)) { heroData = c.hero; drawHero(); }
  }).catch(() => {});

  const hero = $('#hero');
  if (!A.reduced && matchMedia('(hover:hover)').matches) {
    hero.addEventListener('mousemove', e => {
      const r = hero.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      hero.style.setProperty('--mx', x + 'px'); hero.style.setProperty('--my', y + 'px');
      const dx = x / r.width - .5, dy = y / r.height - .5;
      $$('.par', hero).forEach(p => { const d = +p.dataset.depth; p.style.transform = `translate(${dx * d}px,${dy * d}px)`; });
    });
    hero.addEventListener('mouseleave', () => $$('.par', hero).forEach(p => p.style.transform = ''));
  }

  $('#newsletter').addEventListener('submit', async e => {
    e.preventDefault();
    const input = $('#nlEmail');
    try { await A.subscribe(input.value); e.target.reset(); A.toast('You’re on the glow list'); }
    catch (err) { A.toast(err.message); }
  });

  try { products = await A.products(); }
  catch { $('#rail').innerHTML = '<div class="empty">Products could not be loaded. Please refresh the page.</div>'; A.reveal(); return; }

  // Hero art uses real catalogue items, so it follows edits made in the dashboard.
  drawHeroArt();

  // Stats
  const brands = [...new Set(products.map(p => p.brand))];
  $('#stats').innerHTML = [
    [products.length, '', 'products in stock'], [brands.length, '', 'official brands'], [24, 'h', 'to your door in Cairo'], [100, '%', 'authentic'],
  ].map(([n, s, l]) => `<div class="rev"><b data-count="${n}" data-suffix="${s}">0</b><span>${l}</span></div>`).join('');

  // Categories filter the featured rail
  const CATS = ['Skincare', 'Makeup', 'Hair', 'Fragrance'];
  let active = null;
  $('#cats').innerHTML = CATS.map(c => {
    const list = products.filter(p => p.category === c);
    const sample = list[0];
    return `<button class="cat cat-${c}" data-cat="${c}" aria-pressed="false"><b>${c}</b><span>${list.length} item${list.length === 1 ? '' : 's'}</span>${sample ? `<div class="cat-art">${alolaArt(sample)}</div>` : ''}</button>`;
  }).join('');
  const rail = $('#rail');
  function renderRail() {
    let list = products.filter(p => active ? p.category === active : p.featured);
    if (!list.length) list = products;
    rail.innerHTML = list.map(card).join('');
    rail.scrollTo({ left: 0 });
    $$('.card', rail).forEach((el, i) => A.reduced || el.animate([{ opacity: 0, transform: 'translateY(22px)' }, { opacity: 1, transform: 'none' }], { duration: 550, delay: i * 55, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
    $$('.cat').forEach(b => { const on = b.dataset.cat === active; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    $('#allBtn').textContent = active ? `Browse all ${active.toLowerCase()}` : `Browse all ${products.length} products`;
    $('#allBtn').href = active ? `shop.html?category=${active}` : 'shop.html';
  }
  $('#cats').addEventListener('click', e => {
    const b = e.target.closest('.cat'); if (!b) return;
    active = active === b.dataset.cat ? null : b.dataset.cat;
    renderRail();
  });
  renderRail();
  const dir = T.ar ? -1 : 1; // the rail runs the other way in Arabic
  $('#prev').onclick = () => rail.scrollBy({ left: -600 * dir, behavior: 'smooth' });
  $('#next').onclick = () => rail.scrollBy({ left: 600 * dir, behavior: 'smooth' });

  // Marquee: only brands we actually stock, so every name leads to products.
  // The names repeat to fill the loop: only the first set is read out and reachable with Tab.
  const row = copy => brands.map(b => `<a class="bp" translate="no" href="shop.html?brand=${encodeURIComponent(b)}"${copy ? ' tabindex="-1" aria-hidden="true"' : ''}>${esc(b)}</a>`).join('');
  $('#marquee').innerHTML = Array.from({ length: brands.length < 6 ? 6 : 4 }, (_, i) => row(i > 0)).join('');
  const mq = $('#marquee').parentElement, pause = $('#mqPause');
  pause.onclick = () => {
    const paused = mq.classList.toggle('paused');
    pause.setAttribute('aria-pressed', paused);
    pause.textContent = paused ? 'Play' : 'Pause';
  };

  // Ritual: pinned art swaps as the steps scroll past. Hidden if the matching products were removed.
  const RITUAL = [
    { art: 'pump', title: 'Cleanse', text: 'Start fresh. A gentle cleanser lifts away the night without stripping skin.' },
    { art: 'dropper', title: 'Treat', text: 'A targeted serum does the quiet work: balance, clarity and an even tone.' },
    { art: 'tube', title: 'Protect', text: 'Finish with sunscreen, every single day. It’s the step your future skin thanks you for.' },
  ].map(s => ({ ...s, p: products.find(p => p.category === 'Skincare' && p.art === s.art) }));
  if (RITUAL.every(s => s.p)) {
    $('#ritualWrap').hidden = false;
    // Like the hero, this section is decoration: it keeps the drawings even when products have photos.
    const art = p => `<div class="media">${alolaArt(p)}</div>`;
    $('#rStage').innerHTML = RITUAL.map((s, i) => art(s.p).replace('class="media', `data-i="${i}" class="media${i ? '' : ' on'}`)).join('');
    $('#rSteps').innerHTML = RITUAL.map((s, i) => `<article class="step${i ? '' : ' on'}" data-i="${i}">
      <div class="inline-art">${art(s.p)}</div><div class="no">0${i + 1}</div><h3>${s.title}</h3><p>${s.text}</p>
      <a href="${url(s.p)}">${esc(A.pname(s.p))}</a></article>`).join('');
    if ('IntersectionObserver' in window) {
      const stepObs = new IntersectionObserver(es => es.forEach(x => {
        if (!x.isIntersecting) return;
        const i = x.target.dataset.i;
        $$('.step').forEach(s => s.classList.toggle('on', s.dataset.i === i));
        $$('#rStage .media').forEach(m => m.classList.toggle('on', m.dataset.i === i));
      }), { rootMargin: '-45% 0px -45% 0px' });
      $$('.step').forEach(s => stepObs.observe(s));
    }
  }

  A.reveal();
  // Links like /#reviews arrive before content has loaded, so settle on the target again.
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
})();
