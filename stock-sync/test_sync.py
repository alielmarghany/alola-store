"""Tests for reading exports and the safety checks. Runs anywhere (no Windows needed):

    python -m unittest test_sync
"""
import json
import os
import tempfile
import unittest
from unittest import mock

import alola_stock_sync as app
import sheet

HEAD = ['م', 'كود الصنف', 'اسم الصنف', 'عدد الوحدات', 'الرصيد', 'سعر البيع']
ROWS = [
    [1, 14050, 'تونر أنوا', 1, 12, 650],
    [2, '14051', 'ميديكيوب', 1, '٣', '540'],
    [3, 'A-77', 'سيروم', 1, 0, 300],
    [4, 14050, 'تكرار', 1, 99, 1],  # a repeated code: the first one counts
    ['', '', 'الإجمالي', '', 15, ''],  # totals line: no code
]


class Reading(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()

    def path(self, name):
        return os.path.join(self.dir, name)

    def check(self, data):
        self.assertTrue(data['has_stock'])
        got = [(r['code'], r['stock']) for r in data['rows']]
        self.assertEqual(got, [('14050', 12), ('14051', 3), ('A-77', 0)])

    def test_xlsx_with_title_rows_above_the_headings(self):
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(['تقرير أرصدة الأصناف'])
        ws.append([])
        ws.append(HEAD)
        for r in ROWS:
            ws.append(r)
        wb.save(self.path('a.xlsx'))
        self.check(sheet.read(self.path('a.xlsx')))

    def test_old_xls(self):
        try:
            import xlwt
        except ImportError:
            self.skipTest('xlwt is not installed')
        wb = xlwt.Workbook()
        ws = wb.add_sheet('s')
        for i, r in enumerate([HEAD] + ROWS):
            for j, v in enumerate(r):
                ws.write(i, j, v)
        wb.save(self.path('a.xls'))
        self.check(sheet.read(self.path('a.xls')))

    def test_csv_in_arabic_windows_encoding(self):
        text = '\n'.join(';'.join(str(c) for c in r) for r in [HEAD] + ROWS).replace('٣', '3')  # cp1256 has no Arabic digits
        with open(self.path('a.csv'), 'wb') as f:
            f.write(text.encode('cp1256'))
        self.check(sheet.read(self.path('a.csv')))

    def test_html_table_saved_as_xls(self):
        cells = lambda r, t: ''.join(f'<{t}>{c}</{t}>' for c in r)
        html = '<html><body><table><tr>' + cells(HEAD, 'th') + '</tr>' + ''.join(f'<tr>{cells(r, "td")}</tr>' for r in ROWS) + '</table></body></html>'
        with open(self.path('a.xls'), 'w', encoding='utf-8') as f:
            f.write(html)
        self.check(sheet.read(self.path('a.xls')))

    def test_chosen_headings_win(self):
        grid = [['Code', 'Qty', 'Balance'], ['X1', 5, 9]]
        self.assertEqual(sheet.rows_from_grid(grid)['rows'][0]['stock'], 5)
        self.assertEqual(sheet.rows_from_grid(grid, {'stock': 'Balance'})['rows'][0]['stock'], 9)

    def test_estock_crystal_report_data_only(self):
        # E-Stock's "تقرير أصناف مخازن موجز" exported as Excel Data-Only: title rows, the store's own
        # code on every row, headings one column off their values, and totals columns.
        grid = [
            ['تقرير أصناف مخازن موجز', None, None, None, None, None, None, None, None, None, None],
            ['العلا ستور لمستحضرات التجميل', None, None, None, None, None, None, None, None, None, None],
            ['كود المخازن', 'اسم المخازن', None, 'الكود', None, 'اسم الصنف', 'الشركة', 'الوحدة', 'الكمية', 'التكلفة', 'البيع', 'إجمالي البيع'],
            [1, 'الشركة', None, None, 14872, 'ema whitening medium', 'فورمار', 'قطعة', 16, 25.64, 35, 560],
            [1, 'الشركة', None, None, '14,873', 'ema whitening soft', 'فورمار', 'قطعة', '6.00', 25.62, 35, 210],
            [1, 'الشركة', None, None, 12232.0, 'LOREAL ELVIVE', 'فورمار', 'قطعة', 2, 86.91, 115.43, 230],
        ]
        data = sheet.rows_from_grid(grid)
        self.assertEqual([(r['code'], r['stock']) for r in data['rows']], [('14872', 16), ('14873', 6), ('12232', 2)])

    def test_headings_split_over_two_rows(self):
        grid = [['كود', 'اسم', 'الرصيد'], ['الصنف', 'الصنف', 'الحالي'], ['A1', 'x', 3], ['A2', 'y', 4]]
        self.assertEqual([r['stock'] for r in sheet.rows_from_grid(grid)['rows']], [3, 4])

    def test_the_shops_own_export(self):
        path = os.environ.get('ESTOCK_SAMPLE')
        if not path:
            self.skipTest('set ESTOCK_SAMPLE to an export from the shop')
        data = sheet.read(path)
        self.assertTrue(data['has_stock'])
        self.assertGreater(len(data['rows']), 1000)

    def test_numbers(self):
        self.assertEqual(sheet.num('1,250.5'), 1250.5)
        self.assertEqual(sheet.num('٤٥'), 45)
        self.assertEqual(sheet.num('5-'), -5)
        self.assertIsNone(sheet.num('—'))
        self.assertEqual(sheet.code_of(14050.0), '14050')

    def test_no_headings(self):
        with self.assertRaises(sheet.SheetError):
            sheet.rows_from_grid([['a', 'b'], [1, 2]])


class Sending(unittest.TestCase):
    def setUp(self):
        d = tempfile.mkdtemp()
        self.csv = os.path.join(d, 'stock.csv')
        rows = [['كود', 'الرصيد']] + [[f'C{i}', i % 7] for i in range(20)]
        with open(self.csv, 'w', encoding='utf-8') as f:
            f.write('\n'.join(','.join(map(str, r)) for r in rows))
        self.cfg = app.merge(app.DEFAULTS, {'anon_key': 'anon', 'sync_key': 'key', 'export_file': self.csv, 'missing_is_zero': False})
        patches = [mock.patch.object(app, 'STATE', os.path.join(d, 'state.json')), mock.patch.object(app, 'LOCK', os.path.join(d, 'lock'))]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def test_sends_code_and_stock_only_and_remembers_the_count(self):
        sent = {}

        class Res:
            def __enter__(s): return s
            def __exit__(s, *a): pass
            def read(s): return b'{"updated": 4, "matched": 18}'

        def fake(req, timeout):
            sent['url'], sent['body'], sent['h'] = req.full_url, json.loads(req.data), dict(req.headers)
            return Res()
        with mock.patch('urllib.request.urlopen', fake):
            msg = app.sync_once(self.cfg, do_export=False)
        self.assertIn('18 website products matched', msg)
        self.assertTrue(sent['url'].endswith('/rest/v1/rpc/sync_stock'))
        self.assertEqual(sent['body']['p_key'], 'key')
        self.assertEqual(sent['body']['p_rows'][3], {'code': 'C3', 'stock': 3})
        self.assertEqual(app.load_state()['last_rows'], 20)

    def test_website_products_missing_from_the_export_are_sold_out(self):
        self.cfg['missing_is_zero'] = True
        with mock.patch.object(app, '_get', return_value=[{'code': 'C1'}, {'code': 'GONE'}]):
            rows = app.add_missing(self.cfg, [{'code': 'C1', 'stock': 4}])
        self.assertEqual(rows, [{'code': 'C1', 'stock': 4}, {'code': 'GONE', 'stock': 0}])
        # Most of the website missing: the export is probably wrong.
        with mock.patch.object(app, '_get', return_value=[{'code': 'A'}, {'code': 'B'}, {'code': 'C1'}]):
            with self.assertRaisesRegex(app.SyncError, 'missing from the export'):
                app.add_missing(self.cfg, [{'code': 'C1', 'stock': 4}])

    def test_refuses_an_export_much_smaller_than_the_last(self):
        app.save_state({'last_rows': 100})
        with self.assertRaisesRegex(app.SyncError, 'cut short'):
            app.plan(self.cfg, self.csv, app.load_state())

    def test_refuses_when_almost_everything_is_zero(self):
        with open(self.csv, 'w', encoding='utf-8') as f:
            f.write('كود,الرصيد\n' + '\n'.join(f'C{i},0' for i in range(20)))
        with self.assertRaisesRegex(app.SyncError, 'no stock'):
            app.plan(self.cfg, self.csv, {})

    def test_a_refused_key_is_reported(self):
        import io
        import urllib.error

        def fake(req, timeout):
            raise urllib.error.HTTPError(req.full_url, 400, 'Bad', {}, io.BytesIO(b'{"message":"This sync key is not valid."}'))
        with mock.patch('urllib.request.urlopen', fake):
            with self.assertRaisesRegex(app.SyncError, 'not valid'):
                app.send(self.cfg, [{'code': 'C1', 'stock': 1}])


if __name__ == '__main__':
    unittest.main()
