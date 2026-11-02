const { json, cors, method, db, errorResponse } = require("./_lib");

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;
  if (!method(req, res, ["GET"])) return;
  try {
    const rows = await db("services?active=eq.true&select=id,slug,name,description,price_ugx,price_usd&order=name.asc");
    json(res, 200, { services: rows || [] });
  } catch (error) {
    errorResponse(res, error);
  }
};
