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


def kind_of(text, overrides=None):
    """Which column a heading is: code, stock, price, name or other."""
    if overrides:
        t = str(text).strip()
        for kind, heading in overrides.items():
            if heading and t == heading.strip():
                return kind
        # When a heading is set for a kind, other headings never count as that kind.
    h = norm(text)
    if not h:
        return None
    forms = [h, h[::-1]]
    if any('عددالوحدات' in f or 'unitsper' in f for f in forms):
        return 'other'  # units per pack is not stock
    for kind, keys in KINDS:
        if overrides and overrides.get(kind):
            continue
        if any(k in f for f in forms for k in keys):
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
    return re.sub(r'\.0+$', '', to_latin(v).strip())


class SheetError(Exception):
    pass


def rows_from_grid(grid, overrides=None):
    """Finds the heading row in a grid (list of lists) and reads the rows under it."""
    for at, row in enumerate(grid[:40]):
        kinds = [kind_of(c, overrides) for c in row]
        if not is_header(kinds):
            continue
        col = {k: kinds.index(k) for k in ('code', 'stock', 'price', 'name') if k in kinds}
        cell = lambda r, k: r[col[k]] if k in col and col[k] < len(r) else None
        out, seen = [], set()
        for r in grid[at + 1:]:
            if is_header([kind_of(c, overrides) for c in r]):
                continue  # repeated headings on each printed page
            c = code_of(cell(r, 'code'))
            if not c or not re.fullmatch(r'[\w-]{1,40}', c) or c in seen:
                continue
            seen.add(c)
            out.append({
                'code': c,
                'name': str(cell(r, 'name') or '').strip(),
                'stock': num(cell(r, 'stock')),
                'price': num(cell(r, 'price')),
            })
        if not out:
            raise SheetError('No item codes were found under the headings.')
        return {'rows': out, 'has_stock': 'stock' in col, 'has_price': 'price' in col}
    raise SheetError('Couldn’t find the column headings. The sheet needs a code column (كود الصنف) '
                     'and a stock column (الرصيد or الكمية).')


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
