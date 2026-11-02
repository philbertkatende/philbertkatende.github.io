const { json, cors, method, verifyFlutterwave, finalizePayment, errorResponse } = require("./_lib");

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;
  if (!method(req, res, ["GET"])) return;
  try {
    const txRef = String(req.query.tx_ref || "").trim();
    const transactionId = String(req.query.transaction_id || "").trim();
    if (!txRef || !transactionId || !/^\d+$/.test(transactionId)) {
      return json(res, 400, { error: "Missing payment verification details." });
    }
    const transaction = await verifyFlutterwave(transactionId);
    if (transaction.tx_ref !== txRef) return json(res, 400, { error: "Transaction reference mismatch." });
    const result = await finalizePayment(transaction);
    json(res, 200, result);
  } catch (error) {
    errorResponse(res, error);
  }
};
