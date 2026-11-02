const { json, cors, method, db, errorResponse } = require("./_lib");

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;
  if (!method(req, res, ["GET"])) return;
  try {
    const code = String(req.query.invoice_code || "").trim().toUpperCase();
    if (!/^[A-F0-9]{12}$/.test(code)) return json(res, 400, { error: "Enter a valid invoice reference." });
    const rows = await db("invoices?invoice_code=eq." + encodeURIComponent(code) + "&select=invoice_code,description,amount,currency,status,due_at&limit=1");
    const invoice = Array.isArray(rows) ? rows[0] : null;
    if (!invoice) return json(res, 404, { error: "Invoice not found. Check the reference and try again." });
    if (invoice.status !== "unpaid") return json(res, 409, { error: "This invoice is not payable. Its current status is " + invoice.status + "." });
    if (invoice.due_at && new Date(invoice.due_at).getTime() < Date.now()) {
      return json(res, 409, { error: "This invoice has passed its due date. Contact the issuer." });
    }
    json(res, 200, { invoice });
  } catch (error) {
    errorResponse(res, error);
  }
};
