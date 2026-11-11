// Product detail page.
(async function () {
  const { $, $$, esc, card, media } = A;
  A.mountChrome('shop');
  const root = $('#pd');
  const id = Number(new URLSearchParams(location.search).get('id'));
  const notFound = () => { root.innerHTML = `<div class="empty"><h3>Product not found</h3><p>It may have been removed from the store.</p><p style="margin-top:14px"><a class="btn dk" href="shop.html">Browse all products</a></p></div>`; };

  let products;
  try { products = await A.products(); } catch { return notFound(); }
  const p = products.find(x => x.id === id);
  if (!p) return notFound();
  document.title = `${A.pname(p)} | ${T.ar ? 'العلا' : 'Alola'}`;
  window.AlolaTrack?.send('product_view', { product_id: p.id });
  const description = A.loc(p, 'description'), howTo = A.loc(p, 'how_to');

  const related = products.filter(x => x.id !== p.id).sort((a, b) => (b.category === p.category) - (a.category === p.category)).slice(0, 4);
  const stock = p.stock <= 0 ? ['out', 'Sold out'] : p.stock <= 10 ? ['low', `Only ${p.stock} left`] : ['', 'In stock'];
  const tabs = [];
  if (description) tabs.push(['Description', `<p>${esc(description)}</p>`]);
  if (howTo) tabs.push(['How to use', `<p>${esc(howTo)}</p>`]);
  if (p.ingredients) tabs.push(['Ingredients', `<p>${esc(p.ingredients)}</p><p style="color:var(--mute);margin-top:10px;font-size:13px">Always check the packaging for the most up-to-date ingredient list.</p>`]);

  root.innerHTML = `<a class="crumb" href="shop.html">${A.ICON.back} All products</a>
    <div class="pdg">
      <div class="gm ph-${esc(p.category)}" id="gallery">${A.tagHtml(p)}<button class="heart${A.saved().includes(p.id) ? ' on' : ''}" data-heart="${p.id}" aria-label="Save ${esc(A.pname(p))}" aria-pressed="${A.saved().includes(p.id)}">${A.ICON.heart}</button>${media(p)}</div>
      <div class="pdi">
        <div class="br"><a href="shop.html?brand=${encodeURIComponent(p.brand)}">${esc(p.brand)}</a> · <a href="shop.html?category=${encodeURIComponent(p.category)}">${esc(p.category)}</a></div>
        <h1>${esc(A.pname(p))}</h1>
        ${A.rating(p)}
        <div class="pp">${A.price(p)}</div>
        <div class="stk ${stock[0]}"><i></i>${stock[1]} · VAT included</div>
        ${description ? `<p style="color:var(--mute);max-width:520px">${esc(description)}</p>` : ''}
        <div class="buy">
          <div class="qs" role="group" aria-label="Quantity"><button id="qMinus" aria-label="Decrease quantity">−</button><b id="qVal" aria-live="polite">1</b><button id="qPlus" aria-label="Increase quantity">+</button></div>
          <button class="btn ro" id="addBtn" style="padding:14px 34px" ${p.stock <= 0 ? 'disabled' : ''}>${p.stock <= 0 ? 'Sold out' : 'Add to cart'}</button>
        </div>
        <div class="ben"><div>${A.ICON.check}Live stock</div><div>${A.ICON.truck}Cairo 24h, nationwide 3 days</div><div>${A.ICON.cash}Cash on delivery</div><div>${A.ICON.leaf}100% authentic</div></div>
      </div>
    </div>
    ${tabs.length ? `<div class="tabs" role="tablist">` : '<div hidden>'}${tabs.map(([t], i) => `<button role="tab" id="tab${i}" aria-controls="panel${i}" aria-selected="${!i}">${t}</button>`).join('')}</div>
    ${tabs.map(([, h], i) => `<div class="tp" role="tabpanel" id="panel${i}" aria-labelledby="tab${i}" ${i ? 'hidden' : ''}>${h}</div>`).join('')}
    ${related.length ? `<section style="padding-top:30px"><div class="sh"><h2 style="font-size:34px">You may also like</h2></div><div class="grid">${related.map(card).join('')}</div></section>` : ''}`;

  let qty = 1;
  const setQty = n => { qty = Math.max(1, Math.min(n, Math.max(1, p.stock))); $('#qVal').textContent = qty; };
  $('#qMinus').onclick = () => setQty(qty - 1);
  $('#qPlus').onclick = () => { if (qty >= p.stock) A.toast(`Only ${p.stock} in stock`); setQty(qty + 1); };
  $('#addBtn').onclick = async () => {
    if (await A.addToCart(p.id, qty)) { A.flyToCart($('#gallery .media')); A.toast('Added to cart'); setTimeout(() => A.openCart(true), 620); }
  };

  $$('[role=tab]').forEach((t, i) => t.onclick = () => {
    $$('[role=tab]').forEach((x, j) => x.setAttribute('aria-selected', i === j));
    $$('[role=tabpanel]').forEach((x, j) => x.hidden = i !== j);
  });

  // Hover zoom follows the cursor
  const g = $('#gallery'), m = $('.media', g);
  if (!A.reduced && matchMedia('(hover:hover)').matches) {
    g.addEventListener('mousemove', e => { const r = g.getBoundingClientRect(); m.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`; m.style.transform = 'scale(1.45)'; });
    g.addEventListener('mouseleave', () => { m.style.transform = ''; });
  }
})();
