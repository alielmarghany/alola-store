"""Reads the stock sheet E-Stock exports into rows of {code, name, stock, price}.

Columns are found by their headings, in Arabic or English, so the column order doesn't matter.
The same rules as the dashboard's "Update from sheet" (public/admin/sheet.js), so a file that
works there works here.

Reads .xlsx, .xls, .csv, and the HTML tables some programs save with an .xls name.
"""
import csv
import io
import os
import re
from html.parser import HTMLParser

AR_DIGITS = str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')


def to_latin(s):
    return str(s).translate(AR_DIGITS)


def norm(s):
    s = to_latin(s).lower()
    s = re.sub('[ً-ٟـ]', '', s)  # harakat and tatweel
    s = re.sub('[أإآ]', 'ا', s).replace('ة', 'ه').replace('ى', 'ي')
    return re.sub(r'[\s_\-.:/\\()]+', '', s)


KINDS = [
    ('code', ['كود', 'code', 'رقمالصنف', 'sku', 'barcode', 'باركود']),
    ('stock', ['رصيد', 'كميه', 'المتاح', 'stock', 'qty', 'quantity', 'balance', 'onhand']),
    ('price', ['سعر', 'price']),
    ('name', ['اسم', 'صنف', 'name', 'item', 'description']),
]


# Headings about the store or branch, such as كود المخازن, are not the item code.
NOT_ITEM = ['مخزن', 'مخازن', 'فرع', 'store', 'warehouse', 'branch']


def kind_of(text, overrides=None):
    """Which column a heading is: code, stock, price, name or other."""
    if text is None:
        return None
    if overrides:
        t = str(text).strip()
        for kind, heading in overrides.items():
            if heading and t == heading.strip():
                return kind
    h = norm(text)
    if not h:
        return None
    forms = [h, h[::-1]]
    if any('عددالوحدات' in f or 'unitsper' in f for f in forms):
        return 'other'  # units per pack is not stock
    if any(w in f for f in forms for w in ('اجمالي', 'total')):
        return 'other'  # a total value, not the item's own number
    for kind, keys in KINDS:
        if overrides and overrides.get(kind):
            continue  # a heading was set for this kind: only that heading counts
        if any(k in f for f in forms for k in keys):
            if kind == 'code' and any(w in f for f in forms for w in NOT_ITEM):
                continue
            return kind
    return 'other'


def is_header(kinds):
    return 'code' in kinds and ('stock' in kinds or 'price' in kinds)


def num(v):
    if v is None or v == '':
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v) if v == v and abs(v) != float('inf') else None
    s = to_latin(v).replace('٬', '').replace(',', '').replace('٫', '.')
    s = re.sub(r'\s', '', s)
    neg = s.endswith('-') or (s.startswith('(') and s.endswith(')'))  # 5- and (5) are how some reports print negatives
    s = re.sub(r'[^\d.-]', '', s).strip('-')
    if not re.search(r'\d', s):
        return None
    try:
        n = float(s)
    except ValueError:
        return None
    return -n if neg else n


def code_of(v):
    if v is None:
        return ''
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() else ''
    if isinstance(v, int):
        return str(v)
    s = to_latin(v).strip()
    if re.fullmatch(r'\d{1,3}(,\d{3})+(\.0+)?', s):  # 14,872 from a formatted report
        s = s.replace(',', '')
    return re.sub(r'\.0+$', '', s)


class SheetError(Exception):
    pass


def _merge(a, b):
    """Two heading rows read as one, for headings split over two lines."""
    n = max(len(a), len(b))
    cell = lambda r, i: str(r[i]).strip() if i < len(r) and r[i] not in (None, '') else ''
    return [' '.join(x for x in (cell(a, i), cell(b, i)) if x) for i in range(n)]


def _headings(grid, overrides):
    """Finds the heading row. Returns (heading cells, index of the first row after them)."""
    for at in range(min(len(grid), 60)):
        row = grid[at]
        if is_header([kind_of(c, overrides) for c in row]):
            return row, at + 1
        if at + 1 < len(grid):
            both = _merge(row, grid[at + 1])
            if is_header([kind_of(c, overrides) for c in both]):
                return both, at + 2
    return None, None


def _pick(kind, heads, kinds, body):
    """The data column for a kind of heading.

    Normally that's the heading's own column. Reports exported "data only" sometimes put a heading
    a column or two away from its values, leaving its own column empty: then the nearest column
    with fitting values and no heading of its own is used. With more than one heading of a kind
    (two code columns, say), the column whose values fit best wins: most different codes, or most numbers.
    """
    filled = sum(1 for r in body if any(v not in (None, '') for v in r)) or 1
    width = max((len(r) for r in body), default=0)

    def score(c):
        vals = [r[c] for r in body if c < len(r) and r[c] not in (None, '')]
        if kind == 'code':
            codes = [code_of(v) for v in vals]
            return len({x for x in codes if x and re.fullmatch(r'[\w-]{1,40}', x) and re.search(r'\d', x)})
        if kind in ('stock', 'price'):
            return sum(1 for v in vals if num(v) is not None)
        return len(vals)
    own = max(heads, key=score)
    if score(own) >= filled * 0.3:
        return own
    best, best_score = None, 0
    for h in heads:
        for c in sorted(range(h - 2, h + 3), key=lambda c: abs(c - h)):
            if 0 <= c < width and (c in heads or c >= len(kinds) or kinds[c] in (None, 'other')):
                sc = score(c) - abs(c - h) * 0.01  # nearer wins a tie
                if sc > best_score:
                    best, best_score = c, sc
    return best


def rows_from_grid(grid, overrides=None):
    """Finds the heading row in a grid (list of lists) and reads the rows under it."""
    head, start = _headings(grid, overrides)
    if head is None:
        raise SheetError('Couldn’t find the column headings. The sheet needs a code column (كود الصنف) '
                         'and a stock column (الرصيد or الكمية).')
    kinds = [kind_of(c, overrides) for c in head]
    body = [r for r in grid[start:] if not is_header([kind_of(c, overrides) for c in r])]
    sample = body[:300]
    col = {}
    for k in ('code', 'stock', 'price', 'name'):
        heads = [i for i, x in enumerate(kinds) if x == k]
        if heads:
            c = _pick(k, heads, kinds, sample)
            if c is not None and c not in col.values():
                col[k] = c
    if 'code' not in col:
        raise SheetError('No item codes were found under the headings.')
    cell = lambda r, k: r[col[k]] if k in col and col[k] < len(r) else None
    out, seen = [], set()
    for r in body:
        c = code_of(cell(r, 'code'))
        if not c or not re.fullmatch(r'[\w-]{1,40}', c) or c in seen:
            continue
        stock, price = num(cell(r, 'stock')), num(cell(r, 'price'))
        if stock is None and price is None and not re.search(r'\d', c):
            continue  # the second line of a heading, or a subtitle
        seen.add(c)
        out.append({'code': c, 'name': str(cell(r, 'name') or '').strip(), 'stock': stock, 'price': price})
    if not out:
        raise SheetError('No item codes were found under the headings.')
    return {'rows': out, 'has_stock': 'stock' in col, 'has_price': 'price' in col}


class _Tables(HTMLParser):
    def __init__(self):
        super().__init__()
        self.grid, self.row, self.cell, self.in_cell = [], None, [], False

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.row = []
        elif tag in ('td', 'th'):
            self.in_cell, self.cell = True, []
        elif tag == 'br' and self.in_cell:
            self.cell.append(' ')

    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.row is not None:
            self.row.append(' '.join(''.join(self.cell).split()))
            self.in_cell = False
        elif tag == 'tr' and self.row is not None:
            self.grid.append(self.row)
            self.row = None

    def handle_data(self, data):
        if self.in_cell:
            self.cell.append(data)


def _decode(raw):
    for enc in ('utf-8-sig', 'cp1256', 'utf-16'):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode('latin-1')


def grids(path):
    """Each sheet in the file as a list of rows."""
    with open(path, 'rb') as f:
        raw = f.read()
    if not raw:
        raise SheetError('The export file is empty.')
    head = raw[:8]
    if head.startswith(b'PK'):  # .xlsx
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        for ws in wb.worksheets:
            yield [list(r) for r in ws.iter_rows(values_only=True)]
        return
    if head.startswith(b'\xD0\xCF\x11\xE0'):  # old .xls
        import xlrd
        wb = xlrd.open_workbook(file_contents=raw)
        for sh in wb.sheets():
            yield [sh.row_values(i) for i in range(sh.nrows)]
        return
    text = _decode(raw)
    if text.lstrip()[:1] == '<':  # an HTML table saved as .xls
        p = _Tables()
        p.feed(text)
        yield p.grid
        return
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=',;\t|')
    except csv.Error:
        dialect = csv.excel
    yield list(csv.reader(io.StringIO(text), dialect))


def read(path, overrides=None):
    if not os.path.exists(path):
        raise SheetError(f'The export file was not found: {path}')
    if os.path.getsize(path) > 30 * 1024 * 1024:
        raise SheetError('The export file is too large (30 MB at most).')
    last = None
    for grid in grids(path):
        try:
            return rows_from_grid(grid, overrides)
        except SheetError as e:
            last = e
    raise last or SheetError('The export file has no sheets.')
