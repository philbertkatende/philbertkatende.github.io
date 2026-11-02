const { json, cors, method, db, errorResponse } = require("./_lib");

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;
  if (!method(req, res, ["GET"])) return;
  try {
    const txRef = String(req.query.tx_ref || "").trim();
    if (!/^KP-\d{10,}-[A-F0-9]{16}$/.test(txRef)) return json(res, 400, { error: "Invalid payment reference." });
    const rows = await db("payments?tx_ref=eq." + encodeURIComponent(txRef) + "&select=id,tx_ref,amount,currency,status,paid_at,service_id,invoice_id&limit=1");
    const payment = Array.isArray(rows) ? rows[0] : null;
    if (!payment) return json(res, 404, { error: "Payment reference not found." });
    let description = "Payment";
    if (payment.service_id) {
      const services = await db("services?id=eq." + encodeURIComponent(payment.service_id) + "&select=name&limit=1");
      if (services[0]) description = services[0].name;
    } else if (payment.invoice_id) {
      const invoices = await db("invoices?id=eq." + encodeURIComponent(payment.invoice_id) + "&select=description&limit=1");
      if (invoices[0]) description = invoices[0].description;
    }
    let receipt = null;
    if (payment.status === "successful") {
      const receipts = await db("receipts?payment_id=eq." + encodeURIComponent(payment.id) + "&select=receipt_number,issued_at&limit=1");
      receipt = receipts[0] || null;
    }
    json(res, 200, {
      tx_ref: payment.tx_ref, amount: payment.amount, currency: payment.currency,
      status: payment.status, paid_at: payment.paid_at, description, receipt
    });
  } catch (error) {
    errorResponse(res, error);
  }
};
