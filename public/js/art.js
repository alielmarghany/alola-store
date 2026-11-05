// Product packaging illustrations, drawn as SVG so the store looks finished before real photos exist.
// Products with an uploaded photo show that instead (see A.media in common.js).
(function () {
  const COLORS = {
    cream: { a: '#e8dcc6', b: '#fffaf0', c: '#d6c7ab', ink: '#3b261d' },
    white: { a: '#dfe3e1', b: '#ffffff', c: '#ccd3d0', ink: '#2f4a68' },
    olive: { a: '#6e8150', b: '#a3b585', c: '#566840', ink: '#fff' },
    rose: { a: '#b55a6e', b: '#e39bac', c: '#96475a', ink: '#fff' },
    amber: { a: '#9c6126', b: '#dfa763', c: '#7d4c1c', ink: '#fff' },
    gold: { a: '#b8925a', b: '#ecd29c', c: '#957340', ink: '#3b261d' },
    ink: { a: '#2f1e17', b: '#6a4c3d', c: '#21140e', ink: '#f6f2e9' },
    sky: { a: '#96b2c9', b: '#dbe8f1', c: '#7f9cb4', ink: '#22384c' },
    plum: { a: '#6b4763', b: '#ab8aa3', c: '#523549', ink: '#fff' },
  };
  let uid = 0;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Brand name on the pack, shrunk to fit the label width. */
  function label(p, cx, y, width, base, fill) {
    const name = String(p.brand || '');
    const size = Math.min(base, (width / Math.max(name.length, 1)) * 1.65);
    return `<text x="${cx}" y="${y}" text-anchor="middle" font-family="Bricolage Grotesque,system-ui,sans-serif" font-weight="700" font-size="${size.toFixed(1)}" letter-spacing="-.3" fill="${fill}">${esc(name)}</text>`;
  }
  const rule = (cx, y, w, fill) => `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="1.6" rx=".8" fill="${fill}" opacity=".55"/>`;
  const sub = (cx, y, t, fill) => `<text x="${cx}" y="${y}" text-anchor="middle" font-family="DM Sans,system-ui,sans-serif" font-size="8" letter-spacing="1.4" fill="${fill}" opacity=".78">${esc(t)}</text>`;

  const kind = p => String(p.category || '').toUpperCase();

  const SHAPES = {
    dropper: (p, g, c) => `
      <rect x="136" y="38" width="28" height="56" rx="13" fill="url(#${g}k)"/>
      <rect x="128" y="88" width="44" height="36" rx="5" fill="url(#${g}m)"/>
      <path d="M100 150q0-26 24-30h52q24 4 24 30v98q0 18-18 18h-64q-18 0-18-18z" fill="url(#${g}b)"/>
      <rect x="110" y="164" width="80" height="74" rx="4" fill="#fffaf0"/>
      ${label(p, 150, 194, 70, 15, '#3b261d')}${rule(150, 203, 46, '#3b261d')}${sub(150, 219, kind(p), '#3b261d')}
      <path d="M110 134q-3 8-3 22v82" stroke="#fff" stroke-opacity=".45" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    pump: (p, g, c) => `
      <path d="M116 56h58q10 0 10 9v4h-30v22h-10V69h-34q-6 0-6-6t12-7z" fill="url(#${g}m)"/>
      <rect x="128" y="90" width="44" height="26" rx="4" fill="url(#${g}m)"/>
      <rect x="92" y="114" width="116" height="152" rx="20" fill="url(#${g}b)"/>
      ${label(p, 150, 180, 92, 21, c.ink)}${rule(150, 192, 56, c.ink)}${sub(150, 210, kind(p), c.ink)}
      <rect x="102" y="126" width="7" height="128" rx="3.5" fill="#fff" opacity=".6"/>`,
    tube: (p, g, c) => `
      <path d="M86 44h128l-3 14H89z" fill="url(#${g}m)"/>
      <path d="M89 58h122l-27 170h-68z" fill="url(#${g}b)"/>
      ${label(p, 150, 126, 86, 21, c.ink)}${rule(150, 138, 50, c.ink)}${sub(150, 156, kind(p), c.ink)}
      <path d="M104 70l18 148" stroke="#fff" stroke-opacity=".5" stroke-width="6" stroke-linecap="round"/>
      <rect x="112" y="226" width="76" height="40" rx="6" fill="url(#${g}k)"/>`,
    jar: (p, g, c) => `
      <rect x="70" y="104" width="160" height="50" rx="12" fill="url(#${g}k)"/>
      <rect x="80" y="108" width="6" height="42" rx="3" fill="#fff" opacity=".28"/>
      <path d="M78 154h144v90q0 22-22 22H100q-22 0-22-22z" fill="url(#${g}b)"/>
      ${label(p, 150, 204, 118, 26, c.ink)}${rule(150, 216, 62, c.ink)}${sub(150, 234, kind(p), c.ink)}
      <rect x="88" y="164" width="7" height="88" rx="3.5" fill="#fff" opacity=".42"/>`,
    lipstick: (p, g, c) => `
      <path d="M128 136V72q0-16 44-34v98z" fill="url(#${g}b)"/>
      <path d="M128 72q0-16 44-34v22q-30 6-44 22z" fill="#fff" opacity=".2"/>
      <rect x="120" y="132" width="60" height="48" rx="3" fill="url(#${g}m)"/>
      <rect x="110" y="178" width="80" height="88" rx="6" fill="url(#${g}k)"/>
      <rect x="110" y="178" width="80" height="4" fill="#fff" opacity=".2"/>
      <rect x="118" y="186" width="6" height="72" rx="3" fill="#fff" opacity=".25"/>
      ${label(p, 150, 228, 62, 15, '#ecd29c')}`,
    mascara: (p, g, c) => `
      <g transform="rotate(-11 118 160)">
        <rect x="92" y="42" width="44" height="66" rx="7" fill="url(#${g}m)"/>
        <rect x="88" y="104" width="52" height="162" rx="10" fill="url(#${g}b)"/>
        <rect x="96" y="116" width="6" height="138" rx="3" fill="#fff" opacity=".25"/>
        <g transform="rotate(-90 114 190)">${label(p, 114, 196, 120, 18, c.ink)}</g>
      </g>
      <g transform="rotate(14 196 160)">
        <rect x="178" y="178" width="36" height="88" rx="7" fill="url(#${g}m)"/>
        <rect x="193" y="118" width="6" height="62" fill="#3b261d"/>
        ${[...Array(15)].map((_, i) => `<rect x="${182 - Math.sin(i / 14 * Math.PI) * 5}" y="${44 + i * 5.1}" width="${28 + Math.sin(i / 14 * Math.PI) * 10}" height="2.6" rx="1.3" fill="#21140e"/>`).join('')}
        <rect x="194" y="42" width="4" height="78" fill="#3b261d"/>
      </g>`,
    perfume: (p, g, c) => `
      <rect x="120" y="40" width="60" height="48" rx="7" fill="url(#${g}m)"/>
      <rect x="128" y="44" width="5" height="40" rx="2.5" fill="#fff" opacity=".5"/>
      <rect x="132" y="86" width="36" height="24" fill="url(#${g}m)"/>
      <rect x="78" y="106" width="144" height="160" rx="18" fill="#fff" opacity=".42"/>
      <rect x="86" y="130" width="128" height="128" rx="12" fill="url(#${g}b)"/>
      <rect x="110" y="160" width="80" height="66" rx="3" fill="#fffaf0"/>
      ${label(p, 150, 190, 66, 19, '#3b261d')}${rule(150, 199, 40, '#3b261d')}${sub(150, 215, kind(p), '#3b261d')}
      <rect x="88" y="114" width="7" height="140" rx="3.5" fill="#fff" opacity=".7"/>`,
    bottle: (p, g, c) => `
      <rect x="130" y="44" width="40" height="30" rx="5" fill="url(#${g}k)"/>
      <rect x="134" y="72" width="32" height="34" fill="url(#${g}m)"/>
      <path d="M134 102q-36 12-36 48v96q0 20 20 20h64q20 0 20-20v-96q0-36-36-48z" fill="url(#${g}b)"/>
      <rect x="110" y="166" width="80" height="70" rx="4" fill="#3b261d"/>
      ${label(p, 150, 196, 68, 17, '#ecd29c')}${rule(150, 206, 44, '#ecd29c')}${sub(150, 222, kind(p), '#ecd29c')}
      <path d="M108 136q-2 8-2 16v92" stroke="#fff" stroke-opacity=".5" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  };

  /** SVG markup for a product's pack. */
  window.alolaArt = function (p) {
    const c = COLORS[p.color] || COLORS.cream;
    const g = 'ag' + (++uid);
    const shape = SHAPES[p.art] || SHAPES.bottle;
    return `<svg class="pack" viewBox="0 0 300 300" role="img" aria-label="${esc(p.brand + ' ' + ((window.T && T.ar && p.name_ar) || p.name))}">
      <defs>
        <linearGradient id="${g}b" x1="0" x2="1"><stop offset="0" stop-color="${c.a}"/><stop offset=".42" stop-color="${c.b}"/><stop offset="1" stop-color="${c.c}"/></linearGradient>
        <linearGradient id="${g}m" x1="0" x2="1"><stop offset="0" stop-color="#94733f"/><stop offset=".45" stop-color="#f3dfb2"/><stop offset="1" stop-color="#8a6a38"/></linearGradient>
        <linearGradient id="${g}k" x1="0" x2="1"><stop offset="0" stop-color="#21140e"/><stop offset=".45" stop-color="#5e4336"/><stop offset="1" stop-color="#1b100b"/></linearGradient>
      </defs>
      <ellipse cx="150" cy="270" rx="86" ry="9" fill="#3b261d" opacity=".16"/>
      ${shape(p, g, c)}
    </svg>`;
  };

  /** Laurel wreath echoing the logo. Leaves animate in one by one via CSS (.wreath .lf). */
  window.alolaWreath = function ({ size = 400, leaves = 30, a = '#dde5cc', b = '#a9bd87', stem = '#a9bd87' } = {}) {
    const r = size * 0.4, cx = size / 2, cy = size / 2;
    const leaf = `M0 0C${size * .025} ${-size * .036} ${size * .075} ${-size * .038} ${size * .105} 0C${size * .075} ${size * .038} ${size * .025} ${size * .036} 0 0Z`;
    let out = '';
    for (let i = 0; i < leaves; i++) {
      const t = (i / leaves) * 360;
      const side = i % 2 ? 1 : -1;
      const tilt = t + 90 + side * 34;
      out += `<g transform="rotate(${t} ${cx} ${cy}) translate(${cx + r} ${cy}) rotate(${tilt - t})"><g class="lf" style="--i:${i}">
        <path d="${leaf}" fill="${side > 0 ? a : b}"/><path d="M${size * .012} 0H${size * .09}" stroke="#3f4f2c" stroke-opacity=".28" stroke-width=".9"/></g></g>`;
    }
    return `<svg class="wreath" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stem}" stroke-width="1.4" opacity=".6"/>${out}</svg>`;
  };

  /** Small olive sprig used beside section eyebrows. */
  window.alolaSprig = function () {
    return `<svg class="sprig" viewBox="0 0 48 20" aria-hidden="true"><path d="M2 12C14 10 30 10 46 6" stroke="#66794a" stroke-width="1.2" fill="none"/><g fill="#66794a"><path d="M12 11c1-6 6-8 10-8-1 5-5 8-10 8z"/><path d="M26 9.500c1-5 5-7 10-8-1 5-5 8-10 8z"/><path d="M14 11.500c4 0 8 2 9 7-5 0-8-3-9-7z"/><path d="M28 9.500c4 0 8 2 9 7-5 0-8-3-9-7z"/></g></svg>`;
  };
})();
