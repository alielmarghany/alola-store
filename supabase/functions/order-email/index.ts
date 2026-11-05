// Sends the customer an order confirmation, in the language they ordered in. Called by the database after an
// order is placed (see queue_order_email in schema.sql). A problem here never affects the order itself.
//
// Secrets, set in Supabase under Edge Functions > Secrets:
//   BREVO_API_KEY    the Brevo API key
//   EMAIL_FROM       the verified sender address
//   EMAIL_FROM_NAME  optional sender name (default "Alola")
//   STORE_URL        optional live store address
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STORE_URL = (Deno.env.get("STORE_URL") || "https://alielmarghany.github.io/alola-store").replace(/\/$/, "");

const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };
async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...sbHeaders, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`Database ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
const setStatus = (id: number, status: string, error = "") =>
  db(`orders?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ email_status: status, email_error: error.slice(0, 300) }) });

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const GOVERNORATES: Record<string, string> = { Cairo: "القاهرة", Giza: "الجيزة", Alexandria: "الإسكندرية", Aswan: "أسوان", Asyut: "أسيوط", Beheira: "البحيرة", "Beni Suef": "بني سويف", Dakahlia: "الدقهلية", Damietta: "دمياط", Faiyum: "الفيوم", Gharbia: "الغربية", Ismailia: "الإسماعيلية", "Kafr El Sheikh": "كفر الشيخ", Luxor: "الأقصر", Matrouh: "مطروح", Minya: "المنيا", Monufia: "المنوفية", "New Valley": "الوادي الجديد", "North Sinai": "شمال سيناء", "Port Said": "بورسعيد", Qalyubia: "القليوبية", Qena: "قنا", "Red Sea": "البحر الأحمر", Sharqia: "الشرقية", Sohag: "سوهاج", "South Sinai": "جنوب سيناء", Suez: "السويس" };

const TEXT = {
  en: {
    dir: "ltr", align: "left", end: "right", brand: "Alola", currency: "EGP",
    subject: (n: string) => `Your Alola order ${n}`,
    hi: (name: string) => `Thank you, ${name}`,
    intro: "We’ve received your order. We’ll call you to confirm it, then send it on its way.",
    order: "Order", qty: "Qty", subtotal: "Subtotal", discount: "Discount", delivery: "Delivery", free: "Free", total: "Total to pay",
    payment: "Payment", cod: "Cash on delivery", deliverTo: "Delivering to", shop: "Visit the store",
    footer: "You’re receiving this email because this address was used to place an order at Alola. If it wasn’t you, you can ignore this email.",
  },
  ar: {
    dir: "rtl", align: "right", end: "left", brand: "العلا", currency: "ج.م",
    subject: (n: string) => `طلبك من العلا ${n}`,
    hi: (name: string) => `شكرًا لكِ، ${name}`,
    intro: "وصلنا طلبك. سنتصل بك لتأكيده، ثم نرسله إليك.",
    order: "طلب رقم", qty: "الكمية", subtotal: "المجموع", discount: "خصم", delivery: "التوصيل", free: "مجاني", total: "الإجمالي المطلوب",
    payment: "الدفع", cod: "الدفع عند الاستلام", deliverTo: "التوصيل إلى", shop: "زيارة المتجر",
    footer: "وصلتك هذه الرسالة لأن هذا البريد استُخدم لتقديم طلب من العلا. إذا لم تكن أنت، يمكنك تجاهلها.",
  },
};

function buildEmail(o: any, number: string) {
  const ar = o.lang === "ar";
  const t = ar ? TEXT.ar : TEXT.en;
  const money = (n: number) => `${Number(n).toLocaleString("en-US")} ${t.currency}`;
  const first = String(o.customer_name).trim().split(/\s+/)[0];
  const city = ar ? (GOVERNORATES[o.city] || o.city) : o.city;
  const cell = "padding:12px 0;border-bottom:1px solid #eadfce;font-size:14px;color:#3b261d";
  const sum = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:5px 0;font-size:${strong ? 17 : 14}px;${strong ? "font-weight:700;color:#3b261d" : "color:#7a6b60"}">${label}</td><td align="${t.end}" style="padding:5px 0;font-size:${strong ? 17 : 14}px;white-space:nowrap;${strong ? "font-weight:700;color:#3b261d" : "color:#7a6b60"}">${value}</td></tr>`;
  const items = o.order_items.map((i: any) => {
    const name = (ar && i.products?.name_ar) || i.name;
    return `<tr><td style="${cell}"><strong>${esc(name)}</strong><br><span style="color:#7a6b60;font-size:13px">${esc(i.brand)} · ${t.qty}: ${esc(i.qty)}</span></td><td align="${t.end}" style="${cell};white-space:nowrap">${money(i.price * i.qty)}</td></tr>`;
  }).join("");
  const html = `<!doctype html><html lang="${ar ? "ar" : "en"}" dir="${t.dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f2e9;font-family:Arial,Tahoma,sans-serif;color:#3b261d" dir="${t.dir}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f2e9"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden" dir="${t.dir}">
<tr><td align="center" style="padding:26px 24px 14px"><a href="${STORE_URL}/"><img src="${STORE_URL}/assets/logo.png" width="150" alt="${t.brand}" style="display:block;border:0;width:150px;height:auto"></a></td></tr>
<tr><td style="padding:6px 28px 0;text-align:${t.align}">
<h1 style="margin:0 0 8px;font-size:24px;line-height:1.3;color:#3b261d">${esc(t.hi(first))}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#5c4a3f">${t.intro}</p>
<p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#4d5e36">${t.order} <span dir="ltr">${number}</span></p>
</td></tr>
<tr><td style="padding:0 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${t.dir}" style="text-align:${t.align}">${items}</table></td></tr>
<tr><td style="padding:12px 28px 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${t.dir}" style="text-align:${t.align}">
${sum(t.subtotal, money(o.subtotal))}
${o.discount ? sum(`${t.discount} (<span dir="ltr">${esc(o.discount_code)}</span>)`, `−${money(o.discount)}`) : ""}
${sum(t.delivery, o.shipping ? money(o.shipping) : t.free)}
${sum(t.total, money(o.total), true)}
</table></td></tr>
<tr><td style="padding:12px 28px 4px;text-align:${t.align};font-size:14px;line-height:1.6;color:#5c4a3f">
<strong style="color:#3b261d">${t.payment}:</strong> ${t.cod}<br>
<strong style="color:#3b261d">${t.deliverTo}:</strong> ${esc(o.address)}${ar ? "، " : ", "}${esc(city)}<br>
<span dir="ltr">${esc(o.phone)}</span>
</td></tr>
<tr><td align="center" style="padding:20px 28px 26px"><a href="${STORE_URL}/" style="display:inline-block;background:#3b261d;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 26px;border-radius:99px">${t.shop}</a></td></tr>
</table>
<p style="max-width:520px;margin:14px auto 0;font-size:12px;line-height:1.6;color:#7a6b60;text-align:center" dir="${t.dir}">${t.footer}</p>
</td></tr></table></body></html>`;
  const lines = o.order_items.map((i: any) => `- ${(ar && i.products?.name_ar) || i.name} x${i.qty}: ${money(i.price * i.qty)}`).join("\n");
  const text = `${t.hi(first)}\n\n${t.intro}\n\n${t.order} ${number}\n${lines}\n\n${t.total}: ${money(o.total)}\n${t.payment}: ${t.cod}\n${t.deliverTo}: ${o.address}, ${city}\n\n${STORE_URL}/`;
  return { subject: t.subject(number), html, text };
}

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
  let id: number | undefined;
  try {
    // Only the store's own database knows this value.
    const hook = (await db("email_hook?select=secret&limit=1"))?.[0];
    if (!hook?.secret || req.headers.get("x-alola-hook") !== hook.secret) return reply(401, { error: "Not allowed" });

    const body = await req.json();
    id = Number(body.order_id);
    if (!Number.isInteger(id) || id <= 0) return reply(400, { error: "Bad order" });

    const rows = await db(`orders?id=eq.${id}&select=*,order_items(name,brand,price,qty,products(name_ar))`);
    const order = rows?.[0];
    if (!order) return reply(404, { error: "Order not found" });
    const number = `ALO-${10000 + id}`;
    const email = buildEmail(order, number);
    if (body.preview === true) return reply(200, email); // for checking the design; sends nothing

    // Claim the order first, so a repeated call can never send a second email.
    const claimed = await db(`orders?id=eq.${id}&email_status=eq.pending`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ email_status: "sending" }) });
    if (!claimed?.length) return reply(200, { skipped: true });

    const apiKey = Deno.env.get("BREVO_API_KEY"), from = Deno.env.get("EMAIL_FROM");
    if (!apiKey || !from) { await setStatus(id, "not_configured"); return reply(200, { sent: false, reason: "not_configured" }); }

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: from, name: Deno.env.get("EMAIL_FROM_NAME") || "Alola" },
        to: [{ email: order.email, name: order.customer_name }],
        subject: email.subject, htmlContent: email.html, textContent: email.text,
      }),
    });
    if (!res.ok) { await setStatus(id, "failed", `Brevo ${res.status}: ${await res.text()}`); return reply(200, { sent: false }); }
    await setStatus(id, "sent");
    return reply(200, { sent: true });
  } catch (err) {
    console.error(err);
    if (id) await setStatus(id, "failed", String(err)).catch(() => {});
    return reply(500, { error: "Could not send" });
  }
});
