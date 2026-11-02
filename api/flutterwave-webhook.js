const crypto = require("node:crypto");
const { json, cors, method, verifyFlutterwave, finalizePayment, errorResponse } = require("./_lib");

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;
  if (!method(req, res, ["POST"])) return;
  const expected = process.env.FLW_WEBHOOK_SECRET_HASH || "";
  const received = String(req.headers["verif-hash"] || "");
  if (!expected || !received) return json(res, 401, { error: "Invalid webhook signature." });
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return json(res, 401, { error: "Invalid webhook signature." });
  }
  try {
    const event = req.body && typeof req.body === "object" ? req.body : {};
    const data = event.data || {};
    if (event.event !== "charge.completed" || !data.id) return json(res, 200, { received: true });
    const transaction = await verifyFlutterwave(data.id);
    if (transaction.tx_ref !== data.tx_ref) return json(res, 200, { received: true });
    await finalizePayment(transaction);
    json(res, 200, { received: true });
  } catch (error) {
    errorResponse(res, error);
  }
};
