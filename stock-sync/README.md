# Alola Stock Sync

A small Windows program for the shop PC. Every 30 minutes it:

1. Opens E-Stock (or uses it if it's already open)
2. Clicks through E-Stock to export the item balances to a file
3. Reads each **product code** (كود الصنف) and its **stock** (الرصيد or الكمية)
4. Sends them to the website, where products with the same code get the new stock

It only changes stock, never prices. Products on the website need their product code filled in (Dashboard > Products > Edit) to be updated.

## How it stays safe

- The PC holds a **sync key**, not your admin password. The key can only update stock. If the PC is lost, turn the key off in the dashboard.
- It won't send an export that looks wrong: fewer than 5 items, less than half the items of the last export, or more than 90% of items at zero. You can change these limits under `safety` in `config.json`.
- It won't send a file older than the current sync. If E-Stock doesn't save a new file, nothing is sent.
- If something fails, it saves a picture of the screen in the `logs` folder so you can see where it stopped.

## Important: online orders and E-Stock

E-Stock is treated as the true stock. When someone orders on the website, the website lowers its own stock straight away, but the next sync replaces it with E-Stock's number. So **enter website orders into E-Stock** (as a sale) when you confirm them. Otherwise an item sold online can show as in stock again for up to 30 minutes after the next sync.

## Set it up

### 1. Make the sync key

On the dashboard, go to **Products > Update from sheet**. At the bottom, under **Automatic stock sync**, press **Make sync key** and copy it. It's only shown once. If you lose it, make a new one.

The first time only: run `supabase/migration-stock-sync.sql` in the Supabase SQL editor, if the store was set up before this feature.

### 2. Build the program

On any Windows PC with [Python 3.11 or newer](https://www.python.org/downloads/) installed (tick **Add python.exe to PATH**), double-click `build.bat`. It makes a `dist` folder with:

- `AlolaStockSync.exe`: the window the shop uses
- `AlolaStockSync-cli.exe`: the same program for setup commands
- `config.json`: the settings

Copy the `dist` folder to the shop PC as `C:\AlolaSync`.

### 3. Fill in `config.json`

Open it in Notepad. In paths, write each `\` twice.

| Setting | What to put |
|---|---|
| `sync_key` | The key from step 1 |
| `estock.exe` | Where E-Stock's program is. Right-click the E-Stock shortcut > **Properties** > **Target** |
| `estock.window_title` | Words in E-Stock's window title. Run `AlolaStockSync-cli.exe windows` with E-Stock open to see the exact title |
| `export_file` | Where the export is saved, for example `C:\\AlolaSync\\stock.xlsx` |
| `steps` | The clicks that make the export. See below |
| `columns` | Leave empty. Only if the export's headings aren't found, put the exact heading of the code and stock columns |
| `missing_is_zero` | `true` when E-Stock's report leaves out items with no stock (the **الرصيد > 0** box is ticked). A website product whose code isn't in the export is then set to 0. If more than half the website's products are missing, nothing is sent, since the export is probably wrong |

`anon_key` and `supabase_url` are already filled in.

### 4. Record the clicks for E-Stock (`steps`)

Do the export by hand once in E-Stock and write down each click: which menu, which report, which button exports. Then turn each one into a step. They run in order.

| Step | What it does |
|---|---|
| `{"do": "focus"}` | Brings E-Stock to the front |
| `{"do": "click_text", "text": "التقارير"}` | Clicks the button, menu or tab with these exact words |
| `{"do": "click", "x": 120, "y": 45}` | Clicks a point, measured from E-Stock's top-left corner. Add `"double": true` for a double-click |
| `{"do": "menu", "path": "التقارير->أرصدة الأصناف"}` | Picks from a classic menu bar |
| `{"do": "keys", "keys": "%r"}` | Presses keys. `%` is Alt, `^` is Ctrl, `+` is Shift, `{ENTER}`, `{ESC}`, `{TAB}`, `{F5}` |
| `{"do": "type", "text": "..."}` | Types text |
| `{"do": "wait", "seconds": 5}` | Waits, for slow reports |
| `{"do": "wait_window", "title": ".*أرصدة.*"}` | Waits for a window to open and brings it to the front |
| `{"do": "save_as"}` | In the Save window, types `export_file`, presses Enter and agrees to replace the old file |
| `{"do": "close_window", "title": ".*أرصدة.*"}` | Closes a window, such as the report |
| `{"do": "press_ok", "timeout": 60}` | Waits for a message box such as "Export completed" and presses OK |

`save_as` can also pick the file type: `{"do": "save_as", "type": "Microsoft Excel (XLS) Data-Only"}`. Add `"optional": true` to any step that may not be needed every time: if it fails, the sync carries on.

The steps in `config.example.json` are set up for e-Stock Retail 5.4: **المخازن > تقرير أصناف مخازن موجز > بحث > معاينة طباعة > Export Report**, saved as **Microsoft Excel (XLS) Data-Only**.

To find click points and button names, open E-Stock and run:

```
AlolaStockSync-cli.exe pick
```

Hold the mouse over each thing you would click. Every 2 seconds it prints a step for that spot, ready to copy. `click_text` keeps working if the window moves or changes size, so use it when a name is shown. Use `click` with x and y when there's no name.

Test only the E-Stock part, without sending anything:

```
AlolaStockSync-cli.exe export
```

Then check the file it made:

```
AlolaStockSync-cli.exe check
```

It lists the first items and says whether the export would be sent. When it looks right, send it once:

```
AlolaStockSync-cli.exe run
```

Check the dashboard: **Update from sheet > Automatic stock sync** shows the time and how many products changed.

### 5. Start it

Double-click `AlolaStockSync.exe`. The window shows the last sync, counts down to the next one, and has **Sync now**, **Settings** and **Log** buttons. To start it each time Windows starts, double-click `start-with-windows.bat` once.

## Keep the PC ready

The program uses the mouse and keyboard like a person would, so:

- The PC must be on and **logged in**, with the screen **unlocked**. In Windows Settings, set **Screen** and **Sleep** to **Never**, and turn off the screen saver lock. Turning the monitor itself off is fine.
- While it syncs (usually under a minute), don't use the mouse or keyboard on that PC. The window says when it's syncing.
- If E-Stock asks for a login when it opens, add steps for it at the start: `click_text` on the user box, `type` the user name, and so on. The password is then stored in `config.json` on this PC.
- If E-Stock can export on its own on a timer, leave `steps` empty: the program then sends the file at `export_file` whenever it is fresh, without touching the mouse.

If the dashboard shows **No sync for over 2 hours**, check the PC is on and the window is open, then press **Log** to see what went wrong.

## For developers

```
python -m unittest test_sync
```

Tests the export reader and safety checks. They run on any system. Clicking through E-Stock can only be tested on Windows with E-Stock installed.

The website side is `sync_stock` in `supabase/schema.sql`: it checks the key's hash and updates stock by product code with the same rules as the dashboard's sheet upload.
