const { json, cors, method, body, db, requireAdmin, slugify, validEmail, validCurrency, validAmount, errorResponse } = require("./_lib");

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;
  if (!["GET", "POST", "PATCH"].includes(req.method)) return method(req, res, ["GET", "POST", "PATCH"]);
  try {
    await requireAdmin(req);
    if (req.method === "GET") {
      const [payments, invoices, services] = await Promise.all([
        db("payments?select=id,tx_ref,amount,currency,status,created_at,paid_at,customer_id,service_id,invoice_id&order=created_at.desc&limit=100"),
        db("invoices?select=id,invoice_code,customer_name,customer_email,description,amount,currency,status,due_at,created_at&order=created_at.desc&limit=100"),
        db("services?select=id,slug,name,description,price_ugx,price_usd,active,created_at&order=created_at.desc")
      ]);
      const customers = await db("customers?select=id,full_name,email,phone");
      const customerMap = Object.fromEntries((customers || []).map(c => [c.id, c]));
      const serviceMap = Object.fromEntries((services || []).map(s => [s.id, s.name]));
      const invoiceMap = Object.fromEntries((invoices || []).map(i => [i.id, i.description]));
      const enriched = (payments || []).map(p => ({
        ...p,
        customer: customerMap[p.customer_id] || null,
        description: p.service_id ? serviceMap[p.service_id] : invoiceMap[p.invoice_id] || "Payment"
      }));
      const successful = enriched.filter(p => p.status === "successful");
      const totals = successful.reduce((acc, p) => {
        acc[p.currency] = (acc[p.currency] || 0) + Number(p.amount);
        return acc;
      }, {});
      json(res, 200, {
        payments: enriched, invoices: invoices || [], services: services || [],
        summary: {
          total_payments: enriched.length,
          successful_payments: successful.length,
          pending_payments: enriched.filter(p => p.status === "pending" || p.status === "initiated").length,
          failed_payments: enriched.filter(p => p.status === "failed" || p.status === "cancelled").length,
          totals
        }
      });
      return;
    }

    const input = body(req);
    if (req.method === "POST" && input.action === "create_service") {
      const name = String(input.name || "").trim().slice(0, 120);
      const description = String(input.description || "").trim().slice(0, 1000);
      const category = String(input.category || "Professional Services").trim().slice(0, 100);
      const priceUgx = input.price_ugx === "" || input.price_ugx === null || input.price_ugx === undefined ? null : Number(input.price_ugx);
      const priceUsd = input.price_usd === "" || input.price_usd === null || input.price_usd === undefined ? null : Number(input.price_usd);
      if (!name || !category ||
          (priceUgx !== null && !validAmount(priceUgx)) ||
          (priceUsd !== null && !validAmount(priceUsd))) {
        return json(res, 400, { error: "Provide a service name and valid optional prices." });
      }
      const baseSlug = slugify(name);
      const slug = baseSlug + "-" + Math.random().toString(36).slice(2, 7);
      const rows = await db("services", {
        method: "POST", prefer: "return=representation",
        body: { name, category, description, slug, price_ugx: priceUgx, price_usd: priceUsd, active: true }
      });
      json(res, 201, { service: rows[0] });
      return;
    }

    if (req.method === "POST" && input.action === "create_invoice") {
      const customerName = String(input.customer_name || "").trim().slice(0, 120);
      const email = String(input.customer_email || "").trim().toLowerCase();
      const phone = String(input.customer_phone || "").trim().slice(0, 30);
      const description = String(input.description || "").trim().slice(0, 500);
      const currency = String(input.currency || "").toUpperCase();
      const amount = Number(input.amount);
      if (!customerName || !validEmail(email) || !description || !validCurrency(currency) || !validAmount(amount)) {
        return json(res, 400, { error: "Complete all invoice fields with a valid amount and currency." });
      }
      const dueAt = input.due_at ? new Date(input.due_at).toISOString() : null;
      const rows = await db("invoices", {
        method: "POST", prefer: "return=representation",
        body: {
          customer_name: customerName, customer_email: email, customer_phone: phone || null,
          description, amount, currency, due_at: dueAt
        }
      });
      json(res, 201, { invoice: rows[0] });
      return;
    }

    if (req.method === "PATCH" && input.action === "set_service_active") {
      const id = String(input.id || "");
      if (!id) return json(res, 400, { error: "Service ID is required." });
      const rows = await db("services?id=eq." + encodeURIComponent(id), {
        method: "PATCH", prefer: "return=representation",
        body: { active: Boolean(input.active), updated_at: new Date().toISOString() }
      });
      return json(res, 200, { service: rows[0] || null });
    }

    json(res, 400, { error: "Unknown dashboard action." });
  } catch (error) {
    errorResponse(res, error);
  }
};
