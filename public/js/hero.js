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

  /** Draws the boxes. Returns which picture spots now hold a custom picture. */
  function render(data) {
    const h = data && data.main ? data : DEFAULT, custom = data && data.main;
    const m = h.main, hero = document.getElementById('hero');
    if (!hero) return {};
    const eyebrow = say(m, 'eyebrow'), l1 = say(m, 'line1'), l2 = say(m, 'line2'), text = say(m, 'text');
    const buttons = [[say(m, 'btn1_label'), safeLink(m.btn1_link || ''), 'btn'], [say(m, 'btn2_label'), safeLink(m.btn2_link || ''), 'btn gh']]
      .filter(([label, link]) => label && link)
      .map(([label, link, cls], i) => `<a class="${cls}" href="${esc(link)}">${esc(label)}${i === 0 ? ' ' + ARROW : ''}</a>`).join('');
    hero.innerHTML = `${eyebrow ? `<span class="eyebrow${custom ? ' custom' : ''}">${esc(eyebrow)}</span>` : '<span class="eyebrow-gap"></span>'}
      <div class="stage" id="stage"><div class="par" data-depth="10" id="stageWreath"></div><div class="par" data-depth="26"><div class="hero-pack" id="heroPack"></div></div></div>
      <h1>${l1 ? `<span class="ln-m"><span>${esc(l1)}</span></span>` : ''}${l2 ? `<span class="ln-m"><span><em>${esc(l2)}</em></span></span>` : ''}</h1>
      ${text ? `<p>${esc(text)}</p>` : ''}${buttons ? `<div class="acts">${buttons}</div>` : ''}`;
    const out = { main: paint(hero, m) };
    for (const k of ['t2', 't3']) {
      const b = h[k] || {}, tile = document.getElementById(k === 't2' ? 'tileT2' : 'tileT3');
      if (!tile) continue;
      const title = say(b, 'title'), small = say(b, 'text'), link = safeLink(b.link || '');
      tile.innerHTML = `${title ? `<div class="big">${esc(title)}</div>` : ''}${small ? `<small>${esc(small)}</small>` : ''}
        <div class="tile-art" id="art${k.toUpperCase()}"></div>
        ${link ? `<a class="tile-link" href="${esc(link)}" aria-label="${esc([title, small].filter(Boolean).join(': '))}"></a>` : ''}`;
      out[k] = paint(tile, b);
    }
    // Pictures shown in the drawing spots replace the product drawings there.
    if (out.main) document.getElementById('heroPack').innerHTML = `<img src="${esc(out.main)}" alt="${esc([l1, l2].join(' ').trim())}">`;
    if (out.t2) document.getElementById('artT2').innerHTML = `<img src="${esc(out.t2)}" alt="">`;
    if (out.t3) document.getElementById('artT3').innerHTML = `<img src="${esc(out.t3)}" alt="">`;
    return out;
  }
  return { DEFAULT, render, safeLink, safeImage };
})();
