// The home page's three hero boxes. The dashboard's Home page tab saves their content in
// store_settings.hero; until then (or after "Reset to original") the built-in design below is used.
window.AlolaHero = (function () {
  const DEFAULT = {
    main: {
      eyebrow: 'Delivered across Egypt', eyebrow_ar: 'توصيل لكل مصر',
      line1: 'Glow', line1_ar: 'تألّقي', line2: 'loud.', line2_ar: 'بلا حدود.',
      text: 'Skincare, makeup, hair and fragrance from the brands you trust. Real stock, real prices.',
      text_ar: 'العناية بالبشرة والمكياج والشعر والعطور من الماركات التي تثقين بها. مخزون حقيقي وأسعار حقيقية.',
      btn1_label: 'Shop now', btn1_label_ar: 'تسوقي الآن', btn1_link: 'shop.html',
      btn2_label: 'The ritual', btn2_label_ar: 'روتين العناية', btn2_link: '#ritual',
      image: '', image_mode: 'art', bg: '',
    },
    t2: { title: '24h', title_ar: '24 ساعة', text: 'Cairo delivery, 3 days nationwide', text_ar: 'توصيل القاهرة، و3 أيام لباقي المحافظات', link: '', image: '', image_mode: 'art', bg: '' },
    t3: { title: 'COD', title_ar: 'كاش', text: 'Pay in cash when it arrives', text_ar: 'ادفعي نقدًا عند الاستلام', link: '', image: '', image_mode: 'art', bg: '' },
  };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // The database only stores https:// links or pages of this store; this is a second check in the browser.
  const safeLink = v => (/^https:\/\/[^\s"'<>\\]+$/.test(v) || (/^[A-Za-z0-9_#?./][A-Za-z0-9_./?=&%#+-]*$/.test(v) && !v.startsWith('//'))) ? v : '';
  const safeImage = v => /^https:\/\/[^\s"'<>()\\]+$/.test(v || '') ? v : '';
  const ARROW = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16M14 6l6 6-6 6"/></svg>';

  /** A field in the visitor's language, falling back to English. Empty in English means hidden in both. */
  const say = (box, key) => (box[key] || '').trim() ? ((window.T && T.ar && (box[key + '_ar'] || '').trim()) || box[key]).trim() : '';
  /** Light backgrounds get dark text, dark ones light text. */
  function isLight(hex) {
    const n = parseInt(hex.slice(1), 16), [r, g, b] = [n >> 16 & 255, n >> 8 & 255, n & 255].map(c => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
    return .2126 * r + .7152 * g + .0722 * b > .45;
  }
  function paint(tile, box) {
    tile.classList.remove('has-cover', 'on-light', 'on-dark');
    tile.style.background = '';
    const img = safeImage(box.image);
    if (img && box.image_mode === 'cover') {
      tile.classList.add('has-cover');
      tile.insertAdjacentHTML('afterbegin', `<div class="cover" style="background-image:url('${img}')" aria-hidden="true"></div>`);
    } else if (/^#[0-9a-f]{6}$/i.test(box.bg || '')) {
      tile.style.background = box.bg;
      tile.classList.add(isLight(box.bg) ? 'on-light' : 'on-dark');
    }
    return img && box.image_mode !== 'cover' ? img : '';
  }

  // ---------------------------------------- banner slideshows
  let timers = [];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ar = () => !!(window.T && T.ar);
  /** Fills a box with designed banner pictures only. More than one turns into a slideshow. */
  function banner(tile, box, label) {
    const slides = (box.slides || []).map(s => ({ src: safeImage((ar() && s.image_ar) || s.image), link: safeLink(s.link || ''), alt: s.alt || '' })).filter(s => s.src);
    tile.classList.remove('has-cover', 'on-light', 'on-dark');
    tile.style.background = '';
    tile.classList.add('is-banner');
    const many = slides.length > 1;
    tile.innerHTML = `<div class="slides"${many ? ` role="region" aria-roledescription="carousel" aria-label="${esc(label)}"` : ''}>
      ${slides.map((s, i) => {
        const img = `<img src="${esc(s.src)}" alt="${esc(s.alt)}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async">`;
        return `<div class="slide${i ? '' : ' on'}"${many ? ` role="group" aria-roledescription="slide" aria-label="${i + 1} / ${slides.length}"` : ''}${i ? ' inert' : ''}>${s.link ? `<a href="${esc(s.link)}"${s.alt ? '' : ` aria-label="${esc(label)} ${i + 1}"`}>${img}</a>` : img}</div>`;
      }).join('')}
      ${many ? `<button class="sl-arrow prev" type="button" aria-label="${ar() ? 'السابق' : 'Previous'}">‹</button><button class="sl-arrow next" type="button" aria-label="${ar() ? 'التالي' : 'Next'}">›</button>
        <div class="sl-dots">${slides.map((_, i) => `<button type="button" aria-label="${i + 1}"${i ? '' : ' aria-current="true"'}></button>`).join('')}</div>` : ''}</div>`;
    if (!many) return;
    const all = [...tile.querySelectorAll('.slide')], dots = [...tile.querySelectorAll('.sl-dots button')];
    let at = 0, paused = false;
    const go = n => {
      at = (n + all.length) % all.length;
      all.forEach((s, i) => { s.classList.toggle('on', i === at); s.inert = i !== at; });
      dots.forEach((d, i) => i === at ? d.setAttribute('aria-current', 'true') : d.removeAttribute('aria-current'));
    };
    tile.querySelector('.prev').onclick = () => go(at - (document.dir === 'rtl' ? -1 : 1));
    tile.querySelector('.next').onclick = () => go(at + (document.dir === 'rtl' ? -1 : 1));
    dots.forEach((d, i) => d.onclick = () => go(i));
    // Swipe on phones.
    let x0 = null;
    tile.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    tile.addEventListener('touchend', e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) go(at + ((dx < 0) !== (document.dir === 'rtl') ? 1 : -1));
    });
    // Turns every 5 seconds, but never while the visitor is pointing at it or using it with the keyboard.
    tile.addEventListener('mouseenter', () => paused = true); tile.addEventListener('mouseleave', () => paused = false);
    tile.addEventListener('focusin', () => paused = true); tile.addEventListener('focusout', () => paused = false);
    if (!reduced) timers.push(setInterval(() => { if (!paused && !document.hidden) go(at + 1); }, 5000));
  }

  /** Draws the boxes. Returns which picture spots now hold a custom picture. */
  function render(data) {
    timers.forEach(clearInterval); timers = [];
    const h = data && data.main ? data : DEFAULT, custom = data && data.main;
    const m = h.main, hero = document.getElementById('hero');
    if (!hero) return {};
    document.querySelectorAll('.bento .tile').forEach(t => t.classList.remove('is-banner'));
    const isBanner = b => b && b.mode === 'banner' && (b.slides || []).length;
    const eyebrow = say(m, 'eyebrow'), l1 = say(m, 'line1'), l2 = say(m, 'line2'), text = say(m, 'text');
    const buttons = [[say(m, 'btn1_label'), safeLink(m.btn1_link || ''), 'btn'], [say(m, 'btn2_label'), safeLink(m.btn2_link || ''), 'btn gh']]
      .filter(([label, link]) => label && link)
      .map(([label, link, cls], i) => `<a class="${cls}" href="${esc(link)}">${esc(label)}${i === 0 ? ' ' + ARROW : ''}</a>`).join('');
    const out = {};
    if (isBanner(m)) { banner(hero, m, ar() ? 'العروض' : 'Offers'); out.main = 'banner'; }
    else {
      hero.innerHTML = `${eyebrow ? `<span class="eyebrow${custom ? ' custom' : ''}">${esc(eyebrow)}</span>` : '<span class="eyebrow-gap"></span>'}
        <div class="stage" id="stage"><div class="par" data-depth="10" id="stageWreath"></div><div class="par" data-depth="26"><div class="hero-pack" id="heroPack"></div></div></div>
        <h1>${l1 ? `<span class="ln-m"><span>${esc(l1)}</span></span>` : ''}${l2 ? `<span class="ln-m"><span><em>${esc(l2)}</em></span></span>` : ''}</h1>
        ${text ? `<p>${esc(text)}</p>` : ''}${buttons ? `<div class="acts">${buttons}</div>` : ''}`;
      out.main = paint(hero, m);
      if (out.main) document.getElementById('heroPack').innerHTML = `<img src="${esc(out.main)}" alt="${esc([l1, l2].join(' ').trim())}">`;
    }
    for (const k of ['t2', 't3']) {
      const b = h[k] || {}, tile = document.getElementById(k === 't2' ? 'tileT2' : 'tileT3');
      if (!tile) continue;
      if (isBanner(b)) { banner(tile, b, ar() ? 'العروض' : 'Offers'); out[k] = 'banner'; continue; }
      const title = say(b, 'title'), small = say(b, 'text'), link = safeLink(b.link || '');
      tile.innerHTML = `${title ? `<div class="big">${esc(title)}</div>` : ''}${small ? `<small>${esc(small)}</small>` : ''}
        <div class="tile-art" id="art${k.toUpperCase()}"></div>
        ${link ? `<a class="tile-link" href="${esc(link)}" aria-label="${esc([title, small].filter(Boolean).join(': '))}"></a>` : ''}`;
      out[k] = paint(tile, b);
    }
    // Pictures shown in the drawing spots replace the product drawings there.
    for (const k of ['t2', 't3']) if (out[k] && out[k] !== 'banner') document.getElementById('art' + k.toUpperCase()).innerHTML = `<img src="${esc(out[k])}" alt="">`;
    return out;
  }
  return { DEFAULT, render, safeLink, safeImage };
})();
