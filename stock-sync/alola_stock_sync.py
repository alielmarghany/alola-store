"""Alola Stock Sync: runs on the shop PC.

Every 30 minutes it opens E-Stock, exports the stock list, reads each product code and its stock,
and sends them to the online store. Only stock changes on the website, never prices.

  AlolaStockSync.exe            the window: shows the last sync, syncs every 30 minutes, has a Sync now button
  AlolaStockSync.exe run        one sync, then exit (for Windows Task Scheduler)
  AlolaStockSync.exe export     only drive E-Stock and make the export file, without sending anything
  AlolaStockSync.exe check F    read an export file and show what it found, without sending anything
  AlolaStockSync.exe upload F   send an export file you made yourself
  AlolaStockSync.exe pick       helps you set up the clicks: shows where the mouse is over E-Stock
  AlolaStockSync.exe windows    lists open windows, to find E-Stock's window title

Settings are in config.json next to the program. See README.md.
"""
import json
import logging
import logging.handlers
import os
import re
import subprocess
import sys
import threading
import time
import traceback
import urllib.error
import urllib.request
from datetime import datetime

import sheet

APP = 'Alola Stock Sync'
HERE = os.path.dirname(os.path.abspath(sys.executable if getattr(sys, 'frozen', False) else __file__))
CONFIG = os.path.join(HERE, 'config.json')
STATE = os.path.join(HERE, 'state.json')
LOGS = os.path.join(HERE, 'logs')
LOCK = os.path.join(HERE, 'sync.lock')

log = logging.getLogger('sync')

DEFAULTS = {
    'supabase_url': 'https://hjwwougyawnojwezhmlp.supabase.co',
    'anon_key': '',
    'sync_key': '',
    'interval_minutes': 30,
    'estock': {
        'exe': r'C:\E-Stock\EStock.exe',
        'window_title': '.*(E-?Stock|إي ستوك).*',
        'start_wait_seconds': 60,
        'close_after': False,
    },
    'export_file': r'C:\AlolaSync\stock.xlsx',
    'export_wait_seconds': 120,
    'columns': {'code': '', 'stock': ''},
    # E-Stock's report can leave out items with no stock (the الرصيد > 0 box). Then a website
    # product whose code isn't in the export has sold out, and is set to 0.
    'missing_is_zero': True,
    'steps': [],
    'safety': {'min_rows': 5, 'min_share_of_last': 0.5, 'max_zero_share': 0.9, 'max_missing_share': 0.5},
}


# ------------------------------------------------------------------ settings and state
def merge(base, extra):
    out = dict(base)
    for k, v in (extra or {}).items():
        out[k] = merge(base[k], v) if isinstance(v, dict) and isinstance(base.get(k), dict) else v
    return out


def load_config():
    if not os.path.exists(CONFIG):
        raise SystemExit(f'No settings file. Copy config.example.json to {CONFIG} and fill it in.')
    with open(CONFIG, encoding='utf-8-sig') as f:
        return merge(DEFAULTS, json.load(f))


def load_state():
    try:
        with open(STATE, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_state(st):
    tmp = STATE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(st, f, ensure_ascii=False, indent=1)
    os.replace(tmp, STATE)


def setup_logging(console=True):
    os.makedirs(LOGS, exist_ok=True)
    log.setLevel(logging.INFO)
    fh = logging.handlers.RotatingFileHandler(os.path.join(LOGS, 'sync.log'), maxBytes=1_000_000, backupCount=5, encoding='utf-8')
    fh.setFormatter(logging.Formatter('%(asctime)s  %(levelname)-7s %(message)s'))
    log.addHandler(fh)
    if console and sys.stdout:
        sh = logging.StreamHandler(sys.stdout)
        sh.setFormatter(logging.Formatter('%(asctime)s  %(message)s', '%H:%M:%S'))
        log.addHandler(sh)


class Lock:
    """Stops two syncs running at once (the window and a scheduled task, say)."""

    def __enter__(self):
        try:
            if os.path.exists(LOCK) and time.time() - os.path.getmtime(LOCK) > 20 * 60:
                os.remove(LOCK)  # left behind by a crash
            self.fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            raise SyncError('Another sync is already running.')
        os.write(self.fd, str(os.getpid()).encode())
        return self

    def __exit__(self, *a):
        os.close(self.fd)
        try:
            os.remove(LOCK)
        except OSError:
            pass


class SyncError(Exception):
    pass


# ------------------------------------------------------------------ driving E-Stock
class EStock:
    """Opens E-Stock (or uses the open one) and runs the export steps from config.json."""

    def __init__(self, cfg):
        from pywinauto import Application, Desktop, keyboard, mouse  # Windows only
        self.Application, self.Desktop, self.keyboard, self.mouse = Application, Desktop, keyboard, mouse
        self.cfg = cfg
        self.es = cfg['estock']
        self.app = None
        self.win = None

    def find(self, title_re, timeout):
        end = time.time() + timeout
        while True:
            for backend in ('win32', 'uia'):
                try:
                    wins = [w for w in self.Desktop(backend=backend).windows(title_re=title_re, visible_only=True)]
                except Exception:
                    wins = []
                if wins:
                    return wins[0]
            if time.time() > end:
                raise SyncError(f'No window with a title like "{title_re}" appeared within {timeout} seconds.')
            time.sleep(1)

    def open(self):
        try:
            self.win = self.find(self.es['window_title'], 0)
            log.info('E-Stock is already open')
        except SyncError:
            exe = self.es['exe']
            if not os.path.exists(exe):
                raise SyncError(f'E-Stock was not found at {exe}. Fix "exe" in config.json.')
            log.info('Opening E-Stock')
            subprocess.Popen([exe], cwd=os.path.dirname(exe))
            self.win = self.find(self.es['window_title'], self.es['start_wait_seconds'])
        self.focus()

    def focus(self, win=None):
        w = win or self.win
        try:
            if w.is_minimized():
                w.restore()
        except Exception:
            pass
        try:
            w.set_focus()
        except Exception:
            pass
        time.sleep(0.5)

    def point(self, step):
        """A click point. x, y are measured from E-Stock's top-left corner, so moving the window is fine."""
        r = self.win.rectangle()
        return r.left + int(step['x']), r.top + int(step['y'])

    def run_step(self, i, step):
        do = step.get('do')
        log.info('  step %d: %s', i, json.dumps(step, ensure_ascii=False))
        if do == 'wait':
            time.sleep(float(step.get('seconds', 1)))
        elif do == 'focus':
            self.focus()
        elif do == 'keys':
            self.keyboard.send_keys(step['keys'], pause=float(step.get('pause', 0.05)))
        elif do == 'type':
            text = re.sub(r'([{}()+^%~])', r'{\1}', step['text'])
            self.keyboard.send_keys(text, with_spaces=True, pause=0.02)
        elif do == 'click':
            coords = self.point(step)
            button = 'right' if step.get('right') else 'left'
            if step.get('double'):
                self.mouse.double_click(button=button, coords=coords)
            else:
                self.mouse.click(button=button, coords=coords)
        elif do == 'click_text':
            self.click_text(step['text'], float(step.get('timeout', 15)))
        elif do == 'menu':
            try:
                self.win.menu_select(step['path'])
            except Exception:  # menus some programs draw themselves: click each name instead
                for name in step['path'].split('->'):
                    self.click_text(name.strip(), float(step.get('timeout', 15)))
                    time.sleep(0.8)
        elif do == 'press_ok':
            self.press_ok(float(step.get('timeout', 15)))
        elif do == 'wait_window':
            w = self.find(step['title'], float(step.get('timeout', 30)))
            self.focus(w)
        elif do == 'close_window':
            try:
                self.find(step['title'], float(step.get('timeout', 5))).close()
            except SyncError:
                pass
        elif do == 'save_as':
            self.save_as(step)
        else:
            raise SyncError(f'Step {i} has an unknown "do": {do!r}')
        time.sleep(float(step.get('after', 0.7)))

    def click_text(self, text, timeout):
        """Clicks a button, menu item or tab by the words on it, in whichever window is in front."""
        end = time.time() + timeout
        while True:
            for backend in ('uia', 'win32'):
                try:
                    top = self.Desktop(backend=backend).window(active_only=True)
                    ctl = top.child_window(title=text, found_index=0)
                    if ctl.exists(timeout=0.5):
                        try:
                            ctl.click_input()
                        except Exception:
                            ctl.invoke()
                        return
                except Exception:
                    pass
            if time.time() > end:
                raise SyncError(f'Couldn’t find "{text}" on the screen.')
            time.sleep(0.5)

    def press_ok(self, timeout):
        """Waits for a message box (such as "Export completed") and presses OK. Fine if none comes."""
        end = time.time() + timeout
        while time.time() < end:
            try:
                boxes = [w for w in self.Desktop(backend='win32').windows(class_name='#32770', visible_only=True)]
            except Exception:
                boxes = []
            if boxes:
                self.focus(boxes[0])
                self.keyboard.send_keys('{ENTER}')
                return
            time.sleep(1)
        log.info('  no message box came up')

    def choose_type(self, dlg, text):
        """Picks the file type in a Save box, such as "Microsoft Excel (XLS) Data-Only"."""
        try:
            from pywinauto import Desktop
            u = Desktop(backend='uia').window(handle=dlg.handle)
            combo = u.child_window(title_re='Save as type.*|حفظ بنوع.*', control_type='ComboBox')
            combo.expand()
            time.sleep(0.4)
            item = combo.child_window(title_re='.*' + re.escape(text) + '.*', control_type='ListItem', found_index=0)
            item.click_input()
            time.sleep(0.4)
            return
        except Exception as e:
            log.warning('  couldn’t pick "%s" as the file type (%s); keeping the one shown', text, e)

    def save_as(self, step):
        """Fills in a Save dialog with export_file, presses Enter and says yes to replacing the old file."""
        path = self.cfg['export_file']
        title = step.get('title', '.*(Save|Export|حفظ|تصدير|Speichern).*')
        dlg = self.find(title, float(step.get('timeout', 30)))
        self.focus(dlg)
        if step.get('type'):
            self.choose_type(dlg, step['type'])
        try:  # the file name box, when Windows lets us find it
            box = dlg.child_window(class_name='Edit', found_index=0)
            box.set_edit_text(path)
        except Exception:
            self.keyboard.send_keys('%n')  # Alt+N goes to "File name" in standard dialogs
            self.keyboard.send_keys('^a{BACKSPACE}')
            self.keyboard.send_keys(re.sub(r'([{}()+^%~])', r'{\1}', path), with_spaces=True, pause=0.01)
        time.sleep(0.3)
        self.keyboard.send_keys('{ENTER}')
        time.sleep(1.5)
        # "The file already exists. Do you want to replace it?"
        try:
            confirm = self.find('.*(Confirm|Save As|تأكيد|حفظ باسم).*', 2)
            self.focus(confirm)
            self.keyboard.send_keys('%y')
        except SyncError:
            pass

    def close(self):
        if self.es.get('close_after') and self.win:
            log.info('Closing E-Stock')
            try:
                self.win.close()
            except Exception:
                pass

    def screenshot(self, why):
        try:
            from PIL import ImageGrab
            name = os.path.join(LOGS, f'error-{datetime.now():%Y%m%d-%H%M%S}.png')
            ImageGrab.grab().save(name)
            log.info('Saved a picture of the screen for %s: %s', why, name)
        except Exception:
            pass


def export(cfg):
    """Runs E-Stock's export and returns the time the new file was written."""
    path = cfg['export_file']
    if not cfg['steps']:
        # No steps: E-Stock (or a person) makes the file. Only use it if it is fresh.
        if not os.path.exists(path):
            raise SyncError(f'No export file at {path}, and no steps are set to make one.')
        age = time.time() - os.path.getmtime(path)
        if age > cfg['interval_minutes'] * 60 * 2:
            raise SyncError(f'The export file is {int(age // 60)} minutes old. Not sending old stock.')
        return
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    started = time.time()
    es = EStock(cfg)
    try:
        es.open()
        for i, step in enumerate(cfg['steps'], 1):
            try:
                es.run_step(i, step)
            except Exception as e:
                if not step.get('optional'):
                    raise
                log.info('  step %d skipped: %s', i, e)
        wait_for_file(path, started, cfg['export_wait_seconds'])
    except Exception:
        es.screenshot('this error')
        raise
    finally:
        try:
            es.close()
        except Exception:
            pass


def wait_for_file(path, after, timeout):
    """Waits until the export file is newer than this sync and has stopped growing."""
    end = time.time() + timeout
    last = -1
    while time.time() < end:
        if os.path.exists(path) and os.path.getmtime(path) >= after - 2:
            size = os.path.getsize(path)
            if size > 0 and size == last:
                return
            last = size
        time.sleep(1.5)
    raise SyncError(f'E-Stock didn’t save a new export to {path} within {timeout} seconds.')


# ------------------------------------------------------------------ sending to the store
def plan(cfg, path, state):
    over = {k: v for k, v in (cfg.get('columns') or {}).items() if v}
    data = sheet.read(path, over or None)
    if not data['has_stock']:
        raise SyncError('The export has no stock column (الرصيد or الكمية). Set "columns" in config.json.')
    rows = [{'code': r['code'], 'stock': r['stock']} for r in data['rows'] if r['stock'] is not None]
    s = cfg['safety']
    if len(rows) < s['min_rows']:
        raise SyncError(f'Only {len(rows)} items in the export. Not sending, in case the export was cut short.')
    last = state.get('last_rows') or 0
    if last and len(rows) < last * s['min_share_of_last']:
        raise SyncError(f'The export has {len(rows)} items but the last one had {last}. Not sending, in case '
                        'the export was cut short. If items really were removed, use "upload" once by hand.')
    zero = sum(1 for r in rows if r['stock'] <= 0)
    if zero > len(rows) * s['max_zero_share']:
        raise SyncError(f'{zero} of {len(rows)} items show no stock. Not sending, in case the export is wrong.')
    return rows


def _get(cfg, path):
    url = cfg['supabase_url'].rstrip('/') + path
    req = urllib.request.Request(url, headers={'apikey': cfg['anon_key'], 'Authorization': 'Bearer ' + cfg['anon_key']})
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return json.loads(res.read().decode())
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise SyncError(f'Couldn’t reach the store: {getattr(e, "reason", e)}. Check the internet connection.')


def add_missing(cfg, rows):
    """Adds stock 0 for website products whose code isn't in the export (they sold out)."""
    site = {str(p['code']).strip() for p in _get(cfg, '/rest/v1/products?select=code&code=not.is.null') if p.get('code')}
    have = {r['code'] for r in rows}
    missing = sorted(site - have)
    if site and len(missing) > len(site) * cfg['safety']['max_missing_share']:
        raise SyncError(f'{len(missing)} of the {len(site)} products on the website are missing from the export. '
                        'Not sending, in case the export is wrong. Check the product codes match E-Stock.')
    if missing:
        log.info('%d website products are not in the export, so they are sold out: %s', len(missing),
                 ', '.join(missing[:20]) + (' …' if len(missing) > 20 else ''))
    return rows + [{'code': c, 'stock': 0} for c in missing]


def send(cfg, rows):
    if not cfg['sync_key'] or not cfg['anon_key']:
        raise SyncError('Set "sync_key" and "anon_key" in config.json (see README.md).')
    url = cfg['supabase_url'].rstrip('/') + '/rest/v1/rpc/sync_stock'
    body = json.dumps({'p_key': cfg['sync_key'], 'p_rows': rows}).encode()
    req = urllib.request.Request(url, data=body, method='POST', headers={
        'apikey': cfg['anon_key'], 'Authorization': 'Bearer ' + cfg['anon_key'], 'Content-Type': 'application/json'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                return json.loads(res.read().decode())
        except urllib.error.HTTPError as e:
            try:
                msg = json.loads(e.read().decode()).get('message')
            except Exception:
                msg = None
            if e.code < 500:
                raise SyncError(f'The store refused the update: {msg or e.code}')
            err = f'{e.code} {msg or ""}'
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            err = str(getattr(e, 'reason', e))
        log.warning('Couldn’t reach the store (%s). Trying again…', err)
        time.sleep(5 * 2 ** attempt)
    raise SyncError(f'Couldn’t reach the store: {err}. Check the internet connection.')


def sync_once(cfg, do_export=True, path=None):
    """One full sync. Returns a short summary, or raises SyncError."""
    with Lock():
        state = load_state()
        path = path or cfg['export_file']
        if do_export:
            log.info('Exporting stock from E-Stock')
            export(cfg)
        rows = plan(cfg, path, state)
        found = len(rows)
        if cfg.get('missing_is_zero'):
            rows = add_missing(cfg, rows)
        log.info('Sending %d items to the store', len(rows))
        r = send(cfg, rows)
        state.update(last_ok=datetime.now().isoformat(timespec='seconds'), last_rows=found,
                     last_matched=r.get('matched'), last_updated=r.get('updated'), last_error=None)
        save_state(state)
        msg = f'{found} items in the export, {len(rows) - found} sold out on the website. {r.get("matched")} website products matched, {r.get("updated")} changed.'
        log.info(msg)
        return msg


def record_error(e):
    st = load_state()
    st.update(last_error=str(e), last_error_at=datetime.now().isoformat(timespec='seconds'))
    save_state(st)
    log.error('Sync failed: %s', e)
    if not isinstance(e, SyncError):
        log.error(traceback.format_exc())


# ------------------------------------------------------------------ setup helpers
def pick(cfg):
    """Prints the mouse position relative to E-Stock, and what is under it, every 2 seconds."""
    from pywinauto import Desktop
    import ctypes

    class P(ctypes.Structure):
        _fields_ = [('x', ctypes.c_long), ('y', ctypes.c_long)]
    es = EStock(cfg)
    win = es.find(cfg['estock']['window_title'], 5)
    print('Move the mouse over E-Stock. Every 2 seconds this shows a step you can copy into config.json.')
    print('Press Ctrl+C to stop.\n')
    while True:
        p = P()
        ctypes.windll.user32.GetCursorPos(ctypes.byref(p))
        r = win.rectangle()
        name = ''
        try:
            name = Desktop(backend='uia').from_point(p.x, p.y).window_text()
        except Exception:
            pass
        step = {'do': 'click', 'x': p.x - r.left, 'y': p.y - r.top}
        print(json.dumps(step, ensure_ascii=False), f'   (under the mouse: "{name}")' if name else '')
        if name:
            print('   or', json.dumps({'do': 'click_text', 'text': name}, ensure_ascii=False))
        time.sleep(2)


def list_windows():
    from pywinauto import Desktop
    for w in Desktop(backend='win32').windows(visible_only=True):
        t = w.window_text()
        if t:
            print(t)


# ------------------------------------------------------------------ the window
def gui(cfg):
    import tkinter as tk
    from tkinter import ttk

    root = tk.Tk()
    root.title(APP)
    root.geometry('520x330')
    root.minsize(420, 280)
    frm = ttk.Frame(root, padding=16)
    frm.pack(fill='both', expand=True)
    ttk.Label(frm, text=APP, font=('Segoe UI', 14, 'bold')).pack(anchor='w')
    ttk.Label(frm, text=f'Sends E-Stock’s stock to the website every {cfg["interval_minutes"]} minutes. Keep this window open.',
              wraplength=480).pack(anchor='w', pady=(2, 12))
    status = tk.StringVar()
    nxt = tk.StringVar()
    ttk.Label(frm, textvariable=status, wraplength=480, justify='left').pack(anchor='w')
    ttk.Label(frm, textvariable=nxt, foreground='#666').pack(anchor='w', pady=(6, 12))
    bar = ttk.Frame(frm)
    bar.pack(anchor='w')
    busy = threading.Event()
    due = [time.time() + 5]  # first sync shortly after opening

    def show():
        st = load_state()
        lines = []
        if st.get('last_ok'):
            lines.append(f'Last sync: {st["last_ok"].replace("T", " ")}. {st.get("last_rows")} items, '
                         f'{st.get("last_matched")} on the website, {st.get("last_updated")} changed.')
        else:
            lines.append('No sync yet.')
        if st.get('last_error') and (st.get('last_error_at') or '') > (st.get('last_ok') or ''):
            lines.append(f'Last try failed ({st["last_error_at"].replace("T", " ")}): {st["last_error"]}')
        status.set('\n'.join(lines))

    def worker():
        try:
            sync_once(load_config())
        except Exception as e:
            record_error(e)
        finally:
            busy.clear()
            root.after(0, show)

    def start():
        if busy.is_set():
            return
        busy.set()
        due[0] = time.time() + load_config()['interval_minutes'] * 60
        nxt.set('Syncing now… please don’t use the mouse or keyboard until E-Stock finishes.')
        threading.Thread(target=worker, daemon=True).start()

    def tick():
        if not busy.is_set():
            if time.time() >= due[0]:
                start()
            else:
                left = int(due[0] - time.time())
                nxt.set(f'Next sync in {left // 60} min {left % 60:02d} s')
        root.after(1000, tick)

    ttk.Button(bar, text='Sync now', command=start).pack(side='left')
    ttk.Button(bar, text='Settings', command=lambda: os.startfile(CONFIG)).pack(side='left', padx=8)
    ttk.Button(bar, text='Log', command=lambda: os.startfile(os.path.join(LOGS, 'sync.log'))).pack(side='left')
    show()
    tick()
    root.mainloop()


def main(argv):
    cmd = argv[1] if len(argv) > 1 else ''
    frozen_windowed = getattr(sys, 'frozen', False) and not cmd
    setup_logging(console=not frozen_windowed)
    cfg = load_config()
    try:
        if cmd == '':
            gui(cfg)
        elif cmd == 'run':
            print(sync_once(cfg))
        elif cmd == 'loop':
            while True:
                try:
                    sync_once(load_config())
                except Exception as e:
                    record_error(e)
                time.sleep(load_config()['interval_minutes'] * 60)
        elif cmd == 'export':
            with Lock():
                export(cfg)
            print('Export saved to', cfg['export_file'])
        elif cmd == 'check':
            path = argv[2] if len(argv) > 2 else cfg['export_file']
            over = {k: v for k, v in (cfg.get('columns') or {}).items() if v}
            data = sheet.read(path, over or None)
            for r in data['rows'][:15]:
                print(f'  {r["code"]:>12}  stock {r["stock"]!s:>8}  {r["name"]}')
            print(f'{len(data["rows"])} items. Stock column found: {data["has_stock"]}.')
            plan(cfg, path, load_state())
            print('This export would be sent.')
        elif cmd == 'upload':
            print(sync_once(cfg, do_export=False, path=argv[2] if len(argv) > 2 else None))
        elif cmd == 'pick':
            pick(cfg)
        elif cmd == 'windows':
            list_windows()
        else:
            print(__doc__)
            return 2
    except (SyncError, sheet.SheetError) as e:
        record_error(e)
        print('Failed:', e)
        return 1
    except KeyboardInterrupt:
        return 0
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
