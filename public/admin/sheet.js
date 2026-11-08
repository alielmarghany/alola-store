// Reads the shop's item sheet (Excel, CSV or PDF) into rows of { code, name, price, stock }.
// Columns are found by their headings, in Arabic or English, so the column order doesn't matter.
// The Excel and PDF readers are large, so each one loads only when a file of that kind is picked.
window.SheetImport = (function () {
  const loaded = {};
  function loadScript(src) {
    return loaded[src] || (loaded[src] = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok;
      s.onerror = () => { delete loaded[src]; no(new Error('Could not load the file reader. Check your connection and try again.')); };
      document.head.append(s);
    }));
  }

  // ---------------------------------------- headings
  const AR_DIGITS = /[٠-٩۰-۹]/g;
  const toLatin = s => String(s).replace(AR_DIGITS, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)] ?? '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)]);
  const norm = s => toLatin(s).toLowerCase()
    .replace(/[ً-ٟـ]/g, '') // harakat and tatweel
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[\s_\-.:/\\()]+/g, '');
  // Some PDFs store Arabic letters in visual order, so a heading may arrive reversed.
  const KINDS = [
    ['code', ['كود', 'code', 'رقمالصنف', 'sku', 'barcode', 'باركود']],
    ['stock', ['رصيد', 'كميه', 'المتاح', 'stock', 'qty', 'quantity', 'balance', 'onhand']],
    ['price', ['سعر', 'price']],
    ['name', ['اسم', 'صنف', 'name', 'item', 'description']],
  ];
  function kindOf(text) {
    const h = norm(text);
    if (!h) return null;
    const forms = [h, [...h].reverse().join('')];
    if (forms.some(f => f.includes('عددالوحدات') || f.includes('unitsper'))) return 'other'; // units per pack is not stock
    for (const [kind, keys] of KINDS) if (forms.some(f => keys.some(k => f.includes(k)))) return kind;
    return 'other';
  }
  const isHeader = kinds => kinds.includes('code') && (kinds.includes('price') || kinds.includes('stock'));

  // ---------------------------------------- values
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = toLatin(v).replace(/[٬,\s]/g, '').replace('٫', '.').replace(/[^\d.-]/g, '');
    if (!s || !/\d/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function code(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : '';
    return toLatin(v).trim().replace(/\.0+$/, '');
  }
  function finish(rows, cols, source) {
    const out = [], seen = new Set();
    for (const r of rows) {
      if (!r.code || !/^[\w-]{1,40}$/.test(r.code) || seen.has(r.code)) continue;
      seen.add(r.code);
      out.push(r);
    }
    if (!out.length) throw new Error('No item codes were found in this file. Make sure it has a column headed كود الصنف or Code.');
    return { rows: out, hasPrice: cols.includes('price'), hasStock: cols.includes('stock'), source };
  }

  // ---------------------------------------- Excel and CSV
  async function readTable(file) {
    await loadScript('../vendor/xlsx.full.min.js');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', codepage: 65001 });
    for (const name of wb.SheetNames) {
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
      const at = grid.slice(0, 40).findIndex(r => isHeader(r.map(kindOf)));
      if (at < 0) continue;
      const kinds = grid[at].map(kindOf);
      const col = k => kinds.indexOf(k);
      const rows = grid.slice(at + 1).filter(r => !isHeader(r.map(kindOf))).map(r => ({
        code: code(r[col('code')]),
        name: col('name') >= 0 ? String(r[col('name')] ?? '').trim() : '',
        price: col('price') >= 0 ? num(r[col('price')]) : null,
        stock: col('stock') >= 0 ? num(r[col('stock')]) : null,
      }));
      return finish(rows, kinds, 'excel');
    }
    throw new Error('Couldn’t find the column headings. The sheet needs a code column (كود الصنف) and a price (سعر البيع) or stock (الرصيد) column.');
  }

  // ---------------------------------------- PDF
  async function readPdf(file) {
    await loadScript('../vendor/pdf.min.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '../vendor/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
    let header = null; // columns found on the latest page that had headings
    const rows = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const items = (await page.getTextContent()).items
        .filter(i => i.str && i.str.trim())
        .map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width }));
      for (const line of lines(items)) {
        const cells = mergeCells(line);
        const kinds = cells.map(c => kindOf(c.s));
        if (isHeader(kinds)) { header = cells.map((c, i) => ({ kind: kinds[i], mid: c.x + c.w / 2 })); continue; }
        if (!header) continue;
        const r = { code: '', name: '', price: null, stock: null };
        for (const c of cells) {
          const mid = c.x + c.w / 2;
          const col = header.reduce((a, b) => Math.abs(b.mid - mid) < Math.abs(a.mid - mid) ? b : a);
          if (col.kind === 'code') r.code = code(c.s);
          else if (col.kind === 'price') r.price = num(c.s);
          else if (col.kind === 'stock') r.stock = num(c.s);
          else if (col.kind === 'name') r.name += (r.name ? ' ' : '') + c.s.trim();
        }
        rows.push(r);
      }
      page.cleanup();
    }
    if (!header) throw new Error('Couldn’t find the column headings in this PDF. Try exporting the sheet as Excel instead.');
    return finish(rows, header.map(h => h.kind), 'pdf');
  }
  // Text pieces on the same printed line share (nearly) the same height on the page.
  function lines(items) {
    const out = [];
    for (const it of items.sort((a, b) => b.y - a.y)) {
      const line = out.find(l => Math.abs(l.y - it.y) < 3);
      line ? line.items.push(it) : out.push({ y: it.y, items: [it] });
    }
    return out.map(l => l.items.sort((a, b) => a.x - b.x));
  }
  // Joins pieces that sit right next to each other into one cell.
  function mergeCells(items) {
    const cells = [];
    for (const it of items) {
      const last = cells[cells.length - 1];
      if (last && it.x - (last.x + last.w) < 6) { last.s += ' ' + it.s; last.w = it.x + it.w - last.x; }
      else cells.push({ ...it });
    }
    return cells;
  }

  async function read(file) {
    if (file.size > 30 * 1024 * 1024) throw new Error('The file is too large (30 MB at most)');
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...head) === '%PDF-') return readPdf(file);
    return readTable(file);
  }
  return { read, _kindOf: kindOf };
})();
