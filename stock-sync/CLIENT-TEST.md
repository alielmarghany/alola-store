# Testing Alola Stock Sync on the shop PC

The test has two rounds:

- **Round 1:** the shop exports stock from E-Stock by hand and the program sends it to the website. This proves the file and the website connection work.
- **Round 2:** the program does the E-Stock clicks by itself, every 30 minutes.

Round 2 needs the shop's E-Stock clicks, which come from round 1.

## Before you send anything (you, the developer)

1. **Put the website side live.** Merge branch `claude/focused-newton-lj7skd` into `main`. This deploys the dashboard's sync card.
2. **Update the database.** In Supabase, open the SQL Editor and run `supabase/migration-stock-sync.sql` once.
3. **Make the sync key.** In the dashboard, go to **Products > Update from sheet**. At the bottom, under **Automatic stock sync**, press **Make sync key** and copy the key.
4. **Download the program.** On GitHub, open **Actions > Build Alola Stock Sync for Windows**, open the latest green run, and download **AlolaSync** at the bottom. It's a zip.
5. **Add the key.** Unzip it, open `config.json` in Notepad, and replace `PASTE THE SYNC KEY FROM THE DASHBOARD HERE` with the key. For round 1, also change `"steps": [ ... ]` to `"steps": []`, so the program doesn't try to click anything yet. Save, then zip the folder again.
6. **Check product codes.** On the website, products need the same code as in E-Stock (كود الصنف). Products without a code are skipped.
7. **Send the zip privately**, for example on WhatsApp directly to the owner, not in a group. The key inside can change stock on the website.

## Message to send the client (round 1)

> **Testing the automatic stock update, part 1 (about 10 minutes)**
>
> 1. Unzip the file I sent into `C:\AlolaSync`. That folder should have `AlolaStockSync.exe`, `AlolaStockSync-cli.exe` and `config.json` in it.
> 2. Open E-Stock and export the item balances report (كود الصنف and الرصيد) as an Excel file. Save it as `C:\AlolaSync\stock.xlsx`.
> 3. Open the `C:\AlolaSync` folder, click the address bar at the top, type `cmd` and press Enter. A black window opens.
> 4. Type this and press Enter:
>    `AlolaStockSync-cli.exe check C:\AlolaSync\stock.xlsx`
>    It lists the first items with their stock. Take a screenshot.
> 5. If it says **This export would be sent**, type this and press Enter:
>    `AlolaStockSync-cli.exe upload C:\AlolaSync\stock.xlsx`
>    Take a screenshot.
> 6. In the same black window, with E-Stock open, type this and press Enter:
>    `AlolaStockSync-cli.exe windows`
>    Take a screenshot. It shows E-Stock's window name.
> 7. **Record the screen** while you export the report from E-Stock, from the main E-Stock screen to the saved file. Windows+Alt+R records with the Xbox Game Bar, or use your phone. Say what you click.
> 8. Right-click the E-Stock shortcut on the desktop, choose **Properties**, and screenshot the **Target** box.
>
> Send me the screenshots, the recording and the `stock.xlsx` file.
>
> If Windows says "Windows protected your PC", press **More info**, then **Run anyway**. If the antivirus blocks the program, allow it or add `C:\AlolaSync` to its exceptions.

### نفس الرسالة بالعربي

> **تجربة تحديث المخزون التلقائي، الجزء الأول (حوالي ١٠ دقائق)**
>
> ١. فك ضغط الملف اللي بعتهولك في `C:\AlolaSync`. لازم يكون جوه الفولدر `AlolaStockSync.exe` و`AlolaStockSync-cli.exe` و`config.json`.
> ٢. افتح E-Stock وطلّع تقرير أرصدة الأصناف (كود الصنف والرصيد) كملف Excel، واحفظه باسم `C:\AlolaSync\stock.xlsx`.
> ٣. افتح فولدر `C:\AlolaSync`، ودوس على شريط العنوان اللي فوق، واكتب `cmd` ودوس Enter. هتفتح شاشة سودة.
> ٤. اكتب ده ودوس Enter:
>    `AlolaStockSync-cli.exe check C:\AlolaSync\stock.xlsx`
>    هيعرض أول الأصناف والرصيد بتاعها. خد سكرين شوت.
> ٥. لو كتب **This export would be sent**، اكتب ده ودوس Enter:
>    `AlolaStockSync-cli.exe upload C:\AlolaSync\stock.xlsx`
>    وخد سكرين شوت.
> ٦. في نفس الشاشة السودة، وE-Stock مفتوح، اكتب ده ودوس Enter:
>    `AlolaStockSync-cli.exe windows`
>    وخد سكرين شوت. ده بيبين اسم شباك E-Stock.
> ٧. **سجّل الشاشة** وانت بتطلّع التقرير من E-Stock، من الشاشة الرئيسية لحد ما الملف يتحفظ. تقدر تسجل بـ Windows+Alt+R أو بالموبايل. قول انت بتدوس على إيه.
> ٨. كليك يمين على أيقونة E-Stock على سطح المكتب، واختار **Properties**، وخد سكرين شوت لخانة **Target**.
>
> ابعتلي السكرين شوتس والفيديو وملف `stock.xlsx`.
>
> لو ويندوز قال "Windows protected your PC"، دوس **More info** وبعدين **Run anyway**. ولو الأنتي فيرس منع البرنامج، اسمح له أو ضيف `C:\AlolaSync` للاستثناءات.

**After round 1:** open the dashboard. **Update from sheet > Automatic stock sync** should show the sync time and how many products changed. Check a few products' stock against E-Stock.

## Round 2: the program clicks through E-Stock

Using the recording, the window name and the Target path, fill these in `config.json`:

- `estock.exe`: the Target path
- `estock.window_title`: the window name
- `export_file`: `C:\\AlolaSync\\stock.xlsx`
- `steps`: the clicks

If a click has no clear button name, ask the client to run `AlolaStockSync-cli.exe pick` and hold the mouse over that spot. It prints the exact step to copy.

Send the new `config.json`. The client puts it in `C:\AlolaSync` in place of the old one.

### Message to send the client (round 2)

> **Part 2 (about 10 minutes)**
>
> 1. Put the new `config.json` in `C:\AlolaSync`, replacing the old one.
> 2. Open `cmd` in that folder as before, type this and press Enter, then don't touch the mouse or keyboard:
>    `AlolaStockSync-cli.exe export`
>    E-Stock should open and save the report by itself. Tell me if it stops anywhere, and send the pictures in `C:\AlolaSync\logs`.
> 3. If it worked, type `AlolaStockSync-cli.exe run` and send a screenshot.
> 4. Double-click `AlolaStockSync.exe` and leave the window open. It updates the website every 30 minutes.
> 5. Double-click `start-with-windows.bat` once, so it starts when the PC is turned on.
> 6. In Windows Settings > System > Power, set screen and sleep to **Never**. Keep the PC logged in. The program can't click while the PC is locked.
> 7. Enter website orders into E-Stock as sales. E-Stock's stock replaces the website's every 30 minutes.

### نفس الرسالة بالعربي

> **الجزء التاني (حوالي ١٠ دقائق)**
>
> ١. حط ملف `config.json` الجديد في `C:\AlolaSync` مكان القديم.
> ٢. افتح `cmd` في الفولدر زي المرة اللي فاتت، واكتب ده ودوس Enter، وبعدها متلمسش الماوس ولا الكيبورد:
>    `AlolaStockSync-cli.exe export`
>    المفروض E-Stock يفتح ويحفظ التقرير لوحده. قولي لو وقف في أي مكان، وابعتلي الصور اللي في `C:\AlolaSync\logs`.
> ٣. لو اشتغل، اكتب `AlolaStockSync-cli.exe run` وابعتلي سكرين شوت.
> ٤. دوس دبل كليك على `AlolaStockSync.exe` وسيب الشباك مفتوح. هيحدّث الموقع كل ٣٠ دقيقة.
> ٥. دوس دبل كليك على `start-with-windows.bat` مرة واحدة، عشان البرنامج يفتح لوحده لما الجهاز يشتغل.
> ٦. من إعدادات ويندوز > System > Power، خلي الشاشة والـ Sleep على **Never**. وسيب الجهاز مفتوح على اليوزر. البرنامج مش هيقدر يدوس على حاجة والجهاز مقفول.
> ٧. سجّل أوردرات الموقع في E-Stock كمبيعات، لأن رصيد E-Stock بيحل محل رصيد الموقع كل ٣٠ دقيقة.
