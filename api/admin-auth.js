const { json, cors, method, body, validEmail, errorResponse } = require("./_lib");

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;
  if (!method(req, res, ["POST"])) return;
  try {
    const input = body(req);
    const email = String(input.email || "").trim().toLowerCase();
    const token = String(input.token || "").trim();
    const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
    const key = process.env.SUPABASE_PUBLISHABLE_KEY || "";
    if (!url || !key || !adminEmail) return json(res, 503, { error: "Admin sign-in is not configured yet." });
    if (!validEmail(email) || email !== adminEmail) return json(res, 403, { error: "This email is not authorised for the dashboard." });
    if (!token) {
      const response = await fetch(url + "/auth/v1/otp", {
        method: "POST",
        headers: { apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify({ email, create_user: false })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return json(res, response.status, { error: result.msg || result.message || "Could not send the sign-in email." });
      return json(res, 200, { message: "A sign-in code has been sent to your email." });
    }
    const response = await fetch(url + "/auth/v1/verify", {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ email, token, type: "email" })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.access_token) return json(res, 401, { error: result.msg || result.message || "The code is invalid or has expired." });
    if (!result.user || String(result.user.email || "").toLowerCase() !== adminEmail) return json(res, 403, { error: "This account is not authorised." });
    json(res, 200, {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expires_in: result.expires_in,
      user: { email: result.user.email }
    });
  } catch (error) {
    errorResponse(res, error);
  }
};
