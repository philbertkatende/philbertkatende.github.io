const crypto = require("node:crypto");
const { json, cors, method, body, db, validEmail, validCurrency, errorResponse } = require("./_lib");

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;
  if (!method(req, res, ["POST"])) return;
  try {
    const input = body(req);
    const fullName = String(input.full_name || "").trim().slice(0, 120);
    const email = String(input.email || "").trim().toLowerCase();
    const phone = String(input.phone || "").trim().slice(0, 30);
    const currency = String(input.currency || "").toUpperCase();
    const serviceId = String(input.service_id || "").trim();
    const invoiceCode = String(input.invoice_code || "").trim().toUpperCase();

    if (!fullName || !validEmail(email) || !validCurrency(currency) || (!serviceId && !invoiceCode) || (serviceId && invoiceCode)) {
      return json(res, 400, { error: "Complete the required details and select one service or invoice." });
    }

    let amount;
    let service = null;
    let invoice = null;
    if (serviceId) {
      const rows = await db("services?id=eq." + encodeURIComponent(serviceId) + "&active=eq.true&select=id,name,price_ugx,price_usd&limit=1");
      service = Array.isArray(rows) ? rows[0] : null;
      if (!service) return json(res, 404, { error: "This service is unavailable." });
      amount = currency === "UGX" ? service.price_ugx : service.price_usd;
      if (amount === null || amount === undefined) return json(res, 400, { error: "This service is not priced in the selected currency." });
    } else {
      if (!/^[A-F0-9]{12}$/.test(invoiceCode)) return json(res, 400, { error: "Enter a valid invoice reference." });
      const rows = await db("invoices?invoice_code=eq." + encodeURIComponent(invoiceCode) + "&select=id,invoice_code,customer_email,amount,currency,status,due_at&limit=1");
      invoice = Array.isArray(rows) ? rows[0] : null;
      if (!invoice || invoice.status !== "unpaid") return json(res, 404, { error: "This invoice could not be found or is no longer payable." });
      if (invoice.customer_email.toLowerCase() !== email) return json(res, 403, { error: "Use the email address associated with this invoice." });
      if (invoice.currency !== currency) return json(res, 400, { error: "Select the currency shown on the invoice: " + invoice.currency + "." });
      if (invoice.due_at && new Date(invoice.due_at).getTime() < Date.now()) return json(res, 409, { error: "This invoice has passed its due date." });
      amount = invoice.amount;
    }

    let customers = await db("customers?email=eq." + encodeURIComponent(email) + "&select=id&limit=1");
    let customer = Array.isArray(customers) ? customers[0] : null;
    if (customer) {
      const updated = await db("customers?id=eq." + encodeURIComponent(customer.id), {
        method: "PATCH", prefer: "return=representation",
        body: { full_name: fullName, phone: phone || null }
      });
      customer = updated[0];
    } else {
      const inserted = await db("customers", {
        method: "POST", prefer: "return=representation",
        body: { full_name: fullName, email, phone: phone || null }
      });
      customer = inserted[0];
    }

    const txRef = "KP-" + Date.now() + "-" + crypto.randomBytes(8).toString("hex").toUpperCase();
    const paymentRows = await db("payments", {
      method: "POST", prefer: "return=representation",
      body: {
        customer_id: customer.id,
        service_id: service ? service.id : null,
        invoice_id: invoice ? invoice.id : null,
        tx_ref: txRef,
        amount: Number(amount),
        currency,
        status: "initiated"
      }
    });
    const payment = paymentRows[0];

    const secret = process.env.FLW_SECRET_KEY || "";
    if (!secret) {
      await db("payments?id=eq." + encodeURIComponent(payment.id), { method: "PATCH", body: { status: "failed" } });
      return json(res, 503, { error: "Online checkout is not activated yet. Please contact me directly." });
    }

    const siteUrl = (process.env.PAYMENTS_SITE_URL || "https://philbertkatende.github.io").replace(/\/$/, "");
    const flwResponse = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
      body: JSON.stringify({
        tx_ref: txRef,
        amount: String(amount),
        currency,
        redirect_url: siteUrl + "/payment-result.html",
        customer: { email, name: fullName, phonenumber: phone || undefined },
        customizations: {
          title: "Katende Philbert",
          description: service ? service.name : "Invoice payment"
        }
      })
    });
    const provider = await flwResponse.json().catch(() => ({}));
    if (!flwResponse.ok || !provider.data || !provider.data.link) {
      await db("payments?id=eq." + encodeURIComponent(payment.id), {
        method: "PATCH", body: { status: "failed" }
      });
      return json(res, 502, { error: "The payment provider could not create a checkout session. Please try again." });
    }

    await db("payments?id=eq." + encodeURIComponent(payment.id), {
      method: "PATCH",
      body: { status: "pending", payment_link: provider.data.link }
    });
    json(res, 201, { checkout_url: provider.data.link, tx_ref: txRef });
  } catch (error) {
    errorResponse(res, error);
  }
};
