const crypto = require("node:crypto");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || "";

function json(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function cors(req, res) {
  const origin = req.headers.origin || "";
  const configured = (process.env.APP_ORIGINS || "https://philbertkatende.github.io,https://philbertkatendegithubio.vercel.app")
    .split(",").map(x => x.trim()).filter(Boolean);
  const previewOrigin = /^https:\/\/philbertkatendegithubio(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(origin);
  if (configured.includes(origin) || previewOrigin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

function method(req, res, allowed) {
  if (!allowed.includes(req.method)) {
    res.setHeader("Allow", allowed.join(", "));
    json(res, 405, { error: "Method not allowed." });
    return false;
  }
  return true;
}

function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch (_) { return {}; }
  }
  return {};
}

function requireServerConfig() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const error = new Error("Payment backend is not configured yet.");
    error.status = 503;
    throw error;
  }
}

async function db(path, options) {
  requireServerConfig();
  const opts = options || {};
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
    "Content-Type": "application/json"
  };
  if (opts.prefer) headers.Prefer = opts.prefer;
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: opts.method || "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = raw; }
  if (!response.ok) {
    const error = new Error((data && data.message) || "Database request failed.");
    error.status = 502;
    throw error;
  }
  return data;
}

async function requireAdmin(req) {
  requireServerConfig();
  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!adminEmail) {
    const error = new Error("Admin email has not been configured.");
    error.status = 503;
    throw error;
  }
  if (!SUPABASE_PUBLISHABLE_KEY) {
    const error = new Error("Supabase publishable key has not been configured.");
    error.status = 503;
    throw error;
  }
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) {
    const error = new Error("Sign in is required.");
    error.status = 401;
    throw error;
  }
  const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + token }
  });
  if (!response.ok) {
    const error = new Error("Your session is invalid or has expired. Sign in again.");
    error.status = 401;
    throw error;
  }
  const user = await response.json();
  if (!user.email || user.email.toLowerCase() !== adminEmail) {
    const error = new Error("This account is not authorised to access the payment dashboard.");
    error.status = 403;
    throw error;
  }
  return user;
}

function slugify(value) {
  return String(value || "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function validCurrency(value) {
  return value === "UGX" || value === "USD";
}

function validAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && amount <= 100000000000;
}

function txAmountMatches(actual, expected) {
  const a = Math.round(Number(actual) * 100);
  const e = Math.round(Number(expected) * 100);
  return Number.isFinite(a) && Number.isFinite(e) && a === e;
}

async function verifyFlutterwave(transactionId) {
  if (!FLW_SECRET_KEY) {
    const error = new Error("Flutterwave test credentials have not been configured.");
    error.status = 503;
    throw error;
  }
  const response = await fetch("https://api.flutterwave.com/v3/transactions/" + encodeURIComponent(String(transactionId)) + "/verify", {
    headers: { Authorization: "Bearer " + FLW_SECRET_KEY }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.data) {
    const error = new Error("Flutterwave could not verify this transaction.");
    error.status = 502;
    throw error;
  }
  return data.data;
}

async function finalizePayment(transaction) {
  const txRef = String(transaction.tx_ref || "");
  if (!txRef) throw new Error("Transaction reference is missing.");
  const rows = await db("payments?tx_ref=eq." + encodeURIComponent(txRef) + "&select=id,tx_ref,amount,currency,status,invoice_id,service_id&limit=1");
  const payment = Array.isArray(rows) ? rows[0] : null;
  if (!payment) throw new Error("No matching payment record was found.");
  if (String(transaction.currency || "").toUpperCase() !== payment.currency ||
      !txAmountMatches(transaction.amount, payment.amount)) {
    throw new Error("Verified payment details do not match the expected amount or currency.");
  }

  const providerStatus = String(transaction.status || "").toLowerCase();
  if (providerStatus === "successful") {
    if (payment.status !== "successful") {
      const safeResponse = {
        id: transaction.id,
        tx_ref: transaction.tx_ref,
        flw_ref: transaction.flw_ref || null,
        status: transaction.status,
        amount: transaction.amount,
        charged_amount: transaction.charged_amount || null,
        currency: transaction.currency,
        payment_type: transaction.payment_type || null
      };
      await db("rpc/confirm_payment", {
        method: "POST",
        body: {
          p_tx_ref: txRef,
          p_provider_transaction_id: String(transaction.id),
          p_provider_response: safeResponse,
          p_payment_type: transaction.payment_type || null
        }
      });
    }
  } else if (providerStatus === "failed" || providerStatus === "cancelled") {
    if (payment.status !== "successful") {
      await db("payments?tx_ref=eq." + encodeURIComponent(txRef), {
        method: "PATCH",
        body: {
          status: providerStatus,
          provider_transaction_id: String(transaction.id),
          updated_at: new Date().toISOString()
        }
      });
    }
  } else {
    if (payment.status !== "successful") {
      await db("payments?tx_ref=eq." + encodeURIComponent(txRef), {
        method: "PATCH",
        body: { status: "pending", updated_at: new Date().toISOString() }
      });
    }
  }

  const eventStatus = providerStatus || "unknown";
  await db("payment_events?on_conflict=payment_id,provider_transaction_id,event_type", {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=minimal",
    body: [{
      payment_id: payment.id,
      provider_transaction_id: String(transaction.id),
      event_type: "charge.completed:" + eventStatus,
      event_status: eventStatus
    }]
  });
  return { tx_ref: txRef, status: providerStatus === "successful" ? "successful" : (providerStatus === "failed" || providerStatus === "cancelled" ? providerStatus : "pending") };
}

function errorResponse(res, error) {
  const status = Number(error && error.status) || 500;
  json(res, status, { error: status >= 500 ? (error.message || "An unexpected error occurred.") : error.message });
}

module.exports = {
  json, cors, method, body, db, requireAdmin, slugify, validEmail,
  validCurrency, validAmount, verifyFlutterwave, finalizePayment, errorResponse,
  FLW_SECRET_KEY
};
