// Arabic version of the store. Loaded in <head> so the language and direction are set before first paint.
// Page code keeps writing English; everything shown on the page is translated here as it appears.
// To change or add a translation, edit the WORDS or PATTERNS lists below.
window.T = (function () {
  const KEY = 'alola_lang';
  const param = new URLSearchParams(location.search).get('lang');
  const stored = (() => { try { return localStorage.getItem(KEY); } catch { return null; } })();
  const lang = param === 'ar' || param === 'en' ? param
    : stored === 'ar' || stored === 'en' ? stored
    : (navigator.language || '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
  const ar = lang === 'ar';
  // A ?lang= link sets the language for the rest of the visit too.
  if (param === 'ar' || param === 'en') { try { localStorage.setItem(KEY, param); } catch {} }

  function set(next) {
    try { localStorage.setItem(KEY, next); } catch {}
    const u = new URL(location.href);
    u.searchParams.delete('lang');
    // Setting the same address doesn't reload a page whose address has a # part, so reload explicitly.
    if (u.href === location.href) location.reload(); else location.href = u.href;
  }

  document.documentElement.lang = lang;
  document.documentElement.dir = ar ? 'rtl' : 'ltr';
  if (!ar) return { lang, ar, set, t: s => s };

  // Google only sends the fonts a page actually uses, so listing them all here stays light.
  const font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;700;800&family=El+Messiri:wght@500;700&family=Aref+Ruqaa:wght@400;700&family=Lalezar&family=Amiri:wght@400;700&display=swap';
  document.head.append(font);

  const WORDS = {
    // page titles
    'Alola | Cosmetics Store': 'العلا | متجر مستحضرات التجميل',
    'All products | Alola': 'كل المنتجات | العلا',
    'Checkout | Alola': 'إتمام الطلب | العلا',
    'My account | Alola': 'حسابي | العلا',
    'Product | Alola': 'منتج | العلا',

    // header + footer
    'All products': 'كل المنتجات', 'Featured': 'المميزة', 'Brands': 'الماركات', 'Why Alola': 'لماذا العلا', 'Reviews': 'الآراء', 'Cart': 'السلة',
    'Free delivery on orders over': 'توصيل مجاني للطلبات فوق', '1,000 EGP': '1,000 ج.م', '· Cash on delivery across Egypt': '· الدفع عند الاستلام في كل مصر',
    'Skincare, makeup, hair and fragrance from brands you trust, delivered across Egypt.': 'العناية بالبشرة والمكياج والشعر والعطور من ماركات تثقين بها، مع التوصيل لكل مصر.',
    'Shop': 'تسوقي', 'Store': 'المتجر', 'Staff': 'فريق العمل', 'Admin dashboard': 'لوحة التحكم', 'My account': 'حسابي',
    'Prices include VAT · Cash on delivery': 'الأسعار شاملة الضريبة · الدفع عند الاستلام',
    'Search products': 'ابحثي عن منتج', 'Open cart': 'فتح السلة', 'Close cart': 'إغلاق السلة', 'Menu': 'القائمة', 'Main': 'الرئيسية', 'Alola home': 'الصفحة الرئيسية', 'Filters': 'الفلاتر', 'Close filters': 'إغلاق الفلاتر', 'Shopping cart': 'سلة التسوق',

    // categories
    'Skincare': 'العناية بالبشرة', 'Makeup': 'المكياج', 'Hair': 'الشعر', 'Fragrance': 'العطور', 'All': 'الكل',

    // landing page
    'Delivered across Egypt': 'توصيل لكل مصر', 'Glow': 'تألّقي', 'loud.': 'بلا حدود.',
    'Skincare, makeup, hair and fragrance from the brands you trust. Real stock, real prices.': 'العناية بالبشرة والمكياج والشعر والعطور من الماركات التي تثقين بها. مخزون حقيقي وأسعار حقيقية.',
    'Shop now': 'تسوقي الآن', 'The ritual': 'روتين العناية',
    '24h': '24 ساعة', 'Cairo delivery, 3 days nationwide': 'توصيل القاهرة، و3 أيام لباقي المحافظات',
    'COD': 'كاش', 'Pay in cash when it arrives': 'ادفعي نقدًا عند الاستلام',
    'products in stock': 'منتج متوفر', 'official brands': 'ماركة رسمية', 'to your door in Cairo': 'لباب بيتك في القاهرة', 'authentic': 'أصلي',
    'Handpicked': 'مختارة بعناية', 'Featured <em>favourites</em>': 'منتجاتنا <em>المميزة</em>', 'Tap a category to browse.': 'اختاري قسمًا للتصفح.',
    'Previous products': 'المنتجات السابقة', 'Next products': 'المنتجات التالية', 'Featured products': 'المنتجات المميزة',
    'Your routine': 'روتينك', 'A ritual in <em>three steps</em>': 'روتين من <em>ثلاث خطوات</em>',
    'Good skin doesn’t need twelve products. It needs the right three, every morning.': 'البشرة الجميلة لا تحتاج إلى اثني عشر منتجًا، بل إلى ثلاثة مناسبة كل صباح.',
    'Cleanse': 'نظّفي', 'Treat': 'عالجي', 'Protect': 'احمي',
    'Start fresh. A gentle cleanser lifts away the night without stripping skin.': 'ابدئي بانتعاش. منظف لطيف يزيل آثار الليل دون أن يجفف بشرتك.',
    'A targeted serum does the quiet work: balance, clarity and an even tone.': 'سيروم موجّه يقوم بعمله بهدوء: توازن وصفاء ولون موحد.',
    'Finish with sunscreen, every single day. It’s the step your future skin thanks you for.': 'اختتمي بواقي الشمس كل يوم. خطوة ستشكرك عليها بشرتك مستقبلًا.',
    'Official brands': 'ماركات رسمية', 'Trusted by <em>top brands</em>': 'موثوقون من <em>أفضل الماركات</em>',
    '100% authentic, sourced from brand distributors. Tap a name to shop it.': 'منتجات أصلية 100% من موزعي الماركات. اضغطي على الاسم للتسوق.',
    'The basics, done properly': 'الأساسيات كما يجب', 'Why <em>Alola</em>': 'لماذا <em>العلا</em>',
    'Live stock': 'مخزون محدّث', 'If it’s on the site, it’s on our shelf.': 'ما تجدينه على الموقع موجود على رفوفنا.',
    'Fast delivery': 'توصيل سريع', 'Cairo in 24 hours, nationwide in 3 days.': 'القاهرة خلال 24 ساعة، وباقي المحافظات خلال 3 أيام.',
    'Cash on delivery': 'الدفع عند الاستلام', 'Pay when it arrives, not before.': 'ادفعي عند الاستلام، وليس قبله.',
    '100% authentic': 'أصلي 100%', 'Sourced straight from brand distributors.': 'مباشرة من موزعي الماركات.',
    'Loved by <em>customers</em>': 'يحبه <em>عملاؤنا</em>',
    '“The serum arrived in two days and the packaging was perfect.”': '«وصل السيروم في يومين والتغليف كان ممتازًا.»',
    '“Finally a store where in-stock actually means in stock.”': '«أخيرًا متجر يعني فيه "متوفر" أنه متوفر فعلًا.»',
    '“Found my exact foundation shade. Will order again.”': '«وجدت درجة كريم الأساس المناسبة لي تمامًا. سأطلب مرة أخرى.»',
    'Mona, Cairo': 'منى، القاهرة', 'Nour, Alexandria': 'نور، الإسكندرية', 'Salma, Mansoura': 'سلمى، المنصورة',
    'M': 'م', 'N': 'ن', 'S': 'س',
    '5 out of 5 stars': '5 من 5 نجوم', 'out of 5': 'من 5',
    'Join the <em>glow list</em>': 'انضمي إلى <em>قائمتنا</em>', 'Early access to new arrivals and offers.': 'كوني أول من يعرف بالمنتجات الجديدة والعروض.',
    'Email address': 'البريد الإلكتروني', 'Your email': 'بريدك الإلكتروني', 'Subscribe': 'اشتراك',
    'You’re on the glow list': 'تم اشتراكك في القائمة',
    'Products could not be loaded. Please refresh the page.': 'تعذر تحميل المنتجات. يرجى تحديث الصفحة.',

    // product cards + tags
    'Add +': 'أضيفي +', 'Sold out': 'نفد', 'New': 'جديد', 'Best seller': 'الأكثر مبيعًا', 'Sale': 'تخفيض', 'Offer 1+1': 'عرض 1+1',
    'Added to cart': 'أضيف إلى السلة', 'Saved to your list': 'أضيف إلى قائمتك', 'Removed from your list': 'أزيل من قائمتك',
    'This product is sold out': 'هذا المنتج نفد',

    // cart
    'Your cart': 'سلتك', 'Skip to content': 'انتقل إلى المحتوى', 'Your cart is empty': 'سلتك فارغة', 'Find something you’ll love.': 'اعثري على ما تحبينه.', 'Browse products': 'تصفحي المنتجات',
    'You’ve unlocked free delivery': 'حصلتِ على توصيل مجاني', 'Subtotal': 'المجموع', 'Delivery': 'التوصيل', 'Free': 'مجاني', 'Total': 'الإجمالي', 'Checkout': 'إتمام الطلب',
    'Add something before checking out.': 'أضيفي منتجًا قبل إتمام الطلب.',

    // shop page
    'All <em>products</em>': 'كل <em>المنتجات</em>', 'Everything we stock, all in one place.': 'كل ما لدينا في مكان واحد.',
    'Search': 'بحث', 'Products or brands': 'منتجات أو ماركات', 'Category': 'القسم', 'Brand': 'الماركة', 'Price': 'السعر', 'Rating': 'التقييم', 'Availability': 'التوفر',
    'In stock only': 'المتوفر فقط', 'On sale': 'عليه تخفيض', 'My saved items': 'المحفوظات', 'In stock': 'متوفر', 'Saved': 'المحفوظات', 'Any': 'الكل',
    'Sort by': 'ترتيب حسب', 'Sort: Featured': 'ترتيب: المميزة', 'Newest first': 'الأحدث أولًا', 'Price: low to high': 'السعر: من الأقل', 'Price: high to low': 'السعر: من الأعلى', 'Top rated': 'الأعلى تقييمًا', 'Name: A to Z': 'الاسم: أ إلى ي',
    'Minimum price': 'أقل سعر', 'Maximum price': 'أعلى سعر',
    'No products match': 'لا توجد منتجات مطابقة', 'Try removing a filter or searching for something else.': 'جربي إزالة فلتر أو البحث عن شيء آخر.', 'Clear all filters': 'مسح كل الفلاتر', 'Clear all': 'مسح الكل',
    'Products could not be loaded': 'تعذر تحميل المنتجات', 'Please refresh the page.': 'يرجى تحديث الصفحة.',

    // product page
    'Product not found': 'المنتج غير موجود', 'It may have been removed from the store.': 'ربما تمت إزالته من المتجر.', 'Browse all products': 'تصفحي كل المنتجات',
    'Quantity': 'الكمية', 'Decrease quantity': 'تقليل الكمية', 'Increase quantity': 'زيادة الكمية', 'Add to cart': 'أضيفي إلى السلة',
    'Cairo 24h, nationwide 3 days': 'القاهرة 24 ساعة، والمحافظات 3 أيام',
    'Description': 'الوصف', 'How to use': 'طريقة الاستخدام', 'Ingredients': 'المكونات',
    'Always check the packaging for the most up-to-date ingredient list.': 'راجعي العبوة دائمًا لمعرفة أحدث قائمة مكونات.', 'You may also like': 'قد يعجبك أيضًا',

    // checkout
    'Keep shopping': 'متابعة التسوق', 'Check<em>out</em>': 'إتمام <em>الطلب</em>', 'Your details': 'بياناتك', 'Full name': 'الاسم بالكامل', 'Phone': 'الهاتف', 'Email': 'البريد الإلكتروني',
    'Governorate': 'المحافظة', 'Address': 'العنوان', 'Notes (optional)': 'ملاحظات (اختياري)', 'Choose…': 'اختاري…', 'Payment': 'الدفع',
    'Street, building, floor, apartment': 'الشارع، العمارة، الدور، الشقة', 'Anything the courier should know': 'أي معلومة لمندوب التوصيل',
    'Pay the courier when your order arrives.': 'ادفعي للمندوب عند وصول طلبك.', 'Your order': 'طلبك', 'Place order': 'تأكيد الطلب', 'Placing your order…': 'جارٍ تأكيد طلبك…',
    'Have an account?': 'لديك حساب؟', 'Log in': 'تسجيل الدخول', 'to use your saved details, or': 'لاستخدام بياناتك المحفوظة، أو', 'create one': 'أنشئي حسابًا',
    'Logged in as': 'تم الدخول بحساب', '. We’ve filled in your saved details.': '. أدخلنا بياناتك المحفوظة.',
    'Save these details for next time': 'احفظي هذه البيانات للمرة القادمة', 'Thank you,': 'شكرًا لكِ،', 'View my orders': 'عرض طلباتي',
    'Create an account': 'أنشئي حسابًا', 'to check out faster next time.': 'لإتمام طلبك أسرع في المرة القادمة.', 'Checkout could not load': 'تعذر تحميل صفحة الطلب',

    // errors from the database and login service
    'Please check your details': 'يرجى مراجعة بياناتك', 'Please enter your full name': 'يرجى إدخال الاسم بالكامل', 'Please enter a valid phone number': 'يرجى إدخال رقم هاتف صحيح',
    'Please enter a valid email': 'يرجى إدخال بريد إلكتروني صحيح', 'Please choose your governorate': 'يرجى اختيار المحافظة', 'Please enter your full address': 'يرجى إدخال العنوان بالكامل',
    'Your cart is empty.': 'سلتك فارغة.', 'Invalid item in cart': 'يوجد منتج غير صحيح في السلة', 'An item in your cart is no longer available': 'أحد منتجات سلتك لم يعد متوفرًا',
    'Too many orders. Please wait a minute and try again.': 'طلبات كثيرة. يرجى الانتظار دقيقة والمحاولة مرة أخرى.', 'Something went wrong': 'حدث خطأ ما',
    'The store isn’t connected to Supabase yet': 'المتجر غير متصل حاليًا',
    'Wrong email or password': 'البريد الإلكتروني أو كلمة المرور غير صحيحة', 'Please confirm your email first. Check your inbox for the link.': 'يرجى تأكيد بريدك أولًا. راجعي الرسالة في بريدك.',
    'That email already has an account. Try logging in.': 'هذا البريد له حساب بالفعل. جربي تسجيل الدخول.', 'Too many attempts. Please wait a few minutes and try again.': 'محاولات كثيرة. يرجى الانتظار بضع دقائق والمحاولة مرة أخرى.',

    // discount codes
    'Discount code': 'كود الخصم', 'Enter code': 'أدخلي الكود', 'Apply': 'تطبيق', 'Remove': 'إزالة', 'Code applied': 'تم تطبيق الكود',
    'This code isn’t valid': 'هذا الكود غير صحيح', 'This code has expired': 'انتهت صلاحية هذا الكود', 'This code has reached its limit': 'وصل هذا الكود إلى الحد الأقصى للاستخدام',
    'Your order already has free delivery': 'طلبك يحصل بالفعل على توصيل مجاني',

    // account
    'Create account': 'إنشاء حساب', 'Welcome <em>back</em>': 'أهلًا <em>بعودتك</em>', 'Join <em>Alola</em>': 'انضمي إلى <em>العلا</em>', 'Reset your <em>password</em>': 'إعادة تعيين <em>كلمة المرور</em>',
    'Log in to use your saved details and see your orders.': 'سجلي الدخول لاستخدام بياناتك المحفوظة ومتابعة طلباتك.', 'Save your details once and check out faster every time.': 'احفظي بياناتك مرة واحدة وأتمي طلبك أسرع كل مرة.',
    'Enter your email and we’ll send you a link to set a new password.': 'أدخلي بريدك وسنرسل لك رابطًا لتعيين كلمة مرور جديدة.',
    'Password': 'كلمة المرور', 'Forgot your password?': 'نسيتِ كلمة المرور؟', 'At least 8 characters': '8 أحرف على الأقل', 'Send reset link': 'إرسال الرابط', 'Back to log in': 'العودة لتسجيل الدخول', 'Just a moment…': 'لحظة من فضلك…',
    'Please enter your password': 'يرجى إدخال كلمة المرور', 'Use at least 8 characters': 'استخدمي 8 أحرف على الأقل',
    'New <em>password</em>': 'كلمة مرور <em>جديدة</em>', 'Choose a new password for your account.': 'اختاري كلمة مرور جديدة لحسابك.', 'New password': 'كلمة المرور الجديدة', 'Save password': 'حفظ كلمة المرور', 'Password updated': 'تم تحديث كلمة المرور',
    'Loading your account…': 'جارٍ تحميل حسابك…', 'Your account could not load': 'تعذر تحميل حسابك', 'Accounts aren’t available yet': 'الحسابات غير متاحة حاليًا',
    'My <em>account</em>': '<em>حسابي</em>', 'Hi,': 'أهلًا،', 'Log out': 'تسجيل الخروج', 'Logged out': 'تم تسجيل الخروج',
    'My orders': 'طلباتي', 'You haven’t ordered anything yet.': 'لم تطلبي شيئًا بعد.', 'My details': 'بياناتي', 'We’ll fill these in for you at checkout.': 'سنضيفها تلقائيًا عند إتمام الطلب.',
    'Delivery address': 'عنوان التوصيل', 'Save details': 'حفظ البيانات', 'Details saved': 'تم حفظ البيانات', 'Change password': 'تغيير كلمة المرور', 'Update password': 'تحديث كلمة المرور',
    'Received': 'تم الاستلام', 'Confirmed': 'تم التأكيد', 'On its way': 'في الطريق', 'Delivered': 'تم التوصيل', 'Cancelled': 'ملغي',

    // governorates
    'Cairo': 'القاهرة', 'Giza': 'الجيزة', 'Alexandria': 'الإسكندرية', 'Aswan': 'أسوان', 'Asyut': 'أسيوط', 'Beheira': 'البحيرة', 'Beni Suef': 'بني سويف', 'Dakahlia': 'الدقهلية', 'Damietta': 'دمياط', 'Faiyum': 'الفيوم', 'Gharbia': 'الغربية', 'Ismailia': 'الإسماعيلية', 'Kafr El Sheikh': 'كفر الشيخ', 'Luxor': 'الأقصر', 'Matrouh': 'مطروح', 'Minya': 'المنيا', 'Monufia': 'المنوفية', 'New Valley': 'الوادي الجديد', 'North Sinai': 'شمال سيناء', 'Port Said': 'بورسعيد', 'Qalyubia': 'القليوبية', 'Qena': 'قنا', 'Red Sea': 'البحر الأحمر', 'Sharqia': 'الشرقية', 'Sohag': 'سوهاج', 'South Sinai': 'جنوب سيناء', 'Suez': 'السويس',
  };

  const count = (n, one, many) => (Number(n) === 1 ? one : `${n} ${many}`);
  const PATTERNS = [
    [/^Discount \(([A-Z0-9_-]+)\)$/, (_, c) => `خصم (${c})`],
    [/^Discount code ([A-Z0-9_-]+) applied\.$/, (_, c) => `تم تطبيق كود الخصم ${c}.`],
    [/^Spend at least ([\d,]+) EGP to use this code$/, (_, n) => `اشتري بما لا يقل عن ${n} ج.م لاستخدام هذا الكود`],
    [/^© (\d+) Alola Cosmetics$/, (_, y) => `© ${y} العلا لمستحضرات التجميل`],
    [/^(\d[\d,]*) products?$/, (_, n) => count(n, 'منتج واحد', 'منتج')],
    [/^Show (\d[\d,]*) products?$/, (_, n) => `عرض ${count(n, 'منتج واحد', 'منتج')}`],
    [/^(\d+) items?$/, (_, n) => count(n, 'منتج واحد', 'منتج')],
    [/^Browse all (\d+) products$/, (_, n) => `تصفحي كل المنتجات (${n})`],
    [/^Browse all (skincare|makeup|hair|fragrance)$/, (_, c) => `تصفحي ${t(c[0].toUpperCase() + c.slice(1))}`],
    [/^(\d+)h$/, (_, n) => `${n} ساعة`],
    [/^Only (\d+) left in stock$/, (_, n) => `متبقي ${n} فقط في المخزون`],
    [/^Only (\d+) in stock$/, (_, n) => `متبقي ${n} فقط في المخزون`],
    [/^Only (\d+) left$/, (_, n) => `متبقي ${n} فقط`],
    [/^Only (\d+) left of (.+)$/, (_, n, p) => `متبقي ${n} فقط من ${p}`],
    [/^(.+) just sold out$/, (_, p) => `${p} نفد للتو`],
    [/^(.+) · VAT included$/, (_, s) => `${t(s)} · شامل الضريبة`],
    [/^Add (.+) more for free delivery$/, (_, m) => `أضيفي ${m} للحصول على توصيل مجاني`],
    [/^Place order · (.+)$/, (_, m) => `تأكيد الطلب · ${m}`],
    [/^Order (ALO-\d+)$/, (_, n) => `طلب رقم ${n}`],
    [/^Your order is in\. We’ll call you to confirm, then it’s on its way to (.+)\. Pay (.+) in cash on delivery\.$/, (_, c, m) => `وصلنا طلبك. سنتصل بك للتأكيد، ثم يصل إلى ${t(c)}. ادفعي ${m} نقدًا عند الاستلام.`],
    [/^Delivery to (.+): (.+)$/, (_, c, m) => `التوصيل إلى ${t(c)}: ${t(m)}`],
    [/^Almost there\. We sent a confirmation link to (.+)\. Open it, then log in here\.$/, (_, e) => `اقتربنا. أرسلنا رابط التأكيد إلى ${e}. افتحيه ثم سجلي الدخول هنا.`],
    [/^If (.+) has an account, a reset link is on its way\.$/, (_, e) => `إذا كان للبريد ${e} حساب، فسيصله رابط إعادة التعيين.`],
    [/^(.+) to (.+ ج\.م)$/, (_, a, b) => `من ${a} إلى ${b}`],
    [/^(\d(?:\.\d)?)★ & up$/, (_, n) => `${n}★ فأكثر`],
    [/^(.*) ×$/, (_, l) => `${t(l)} ×`],
    [/^Remove filter (.+)$/, (_, l) => `إزالة الفلتر ${t(l)}`],
    [/^Save (.+)$/, (_, n) => `حفظ ${n}`],
    [/^Remove one (.+)$/, (_, n) => `إزالة واحد من ${n}`],
    [/^Add one (.+)$/, (_, n) => `إضافة واحد من ${n}`],
  ];

  function t(s) {
    if (Object.prototype.hasOwnProperty.call(WORDS, s)) return WORDS[s];
    for (const [re, fn] of PATTERNS) { const m = re.exec(s); if (m) return fn(...m); }
    return s;
  }

  // ---------- translate what appears on the page
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'svg', 'SVG', 'TITLE']);
  function textNode(n) {
    const raw = n.nodeValue, key = raw.trim();
    if (!key) return;
    const out = t(key);
    if (out !== key) n.nodeValue = raw.replace(key, out);
  }
  function attrs(el) {
    for (const a of ['placeholder', 'aria-label', 'alt']) {
      const v = el.getAttribute(a);
      if (v) { const out = t(v.trim()); if (out !== v) el.setAttribute(a, out); }
    }
  }
  function walk(el) {
    if (SKIP.has(el.tagName)) return;
    attrs(el);
    // Headings with an accent word are translated whole, so the word order can change.
    if (el.firstElementChild && el.innerHTML) {
      const key = el.innerHTML.trim();
      if (Object.prototype.hasOwnProperty.call(WORDS, key)) { el.innerHTML = WORDS[key]; return; }
    }
    for (const c of [...el.childNodes]) {
      if (c.nodeType === 3) textNode(c);
      else if (c.nodeType === 1) walk(c);
    }
  }
  const seen = new WeakSet();
  function start() {
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'characterData') {
          if (!seen.has(m.target) || m.target.nodeValue) { seen.add(m.target); if (m.target.parentElement && !SKIP.has(m.target.parentElement.tagName)) textNode(m.target); }
          continue;
        }
        for (const n of m.addedNodes) {
          if (n.nodeType === 3) { if (n.parentElement && !SKIP.has(n.parentElement.tagName)) textNode(n); }
          else if (n.nodeType === 1) walk(n);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    const title = document.querySelector('title');
    if (title) document.title = t(document.title);
  }
  start();
  document.addEventListener('DOMContentLoaded', () => { document.title = t(document.title); if (document.body) walk(document.body); });

  return { lang, ar, set, t };
})();
