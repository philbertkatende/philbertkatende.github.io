(() => {
  const $ = id => document.getElementById(id);
  const API_BASE = location.hostname.endsWith("github.io") ? "https://philbertkatendegithubio.vercel.app" : "";
  let allPayments = [];
  let accessToken = sessionStorage.getItem("kp_admin_token") || "";
  let adminEmail = sessionStorage.getItem("kp_admin_email") || "";
  const api = async (path, options = {}) => {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: "Bearer " + accessToken } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  };
  const formData = form => Object.fromEntries(new FormData(form).entries());
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = (value, currency) => new Intl.NumberFormat("en-UG", { style: "currency", currency, maximumFractionDigits: currency === "UGX" ? 0 : 2 }).format(Number(value));
  const setMessage = (id, text, error = false) => { $(id).textContent = text; $(id).className = "form-message" + (error ? " error" : ""); };
  const loginForm = $("login-form");
  let otpSent = false;
  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    const email = $("admin-email").value.trim().toLowerCase();
    const token = otpSent ? $("admin-otp").value.trim() : "";
    $("login-button").disabled = true;
    try {
      const result = await api("/api/admin-auth", { method: "POST", body: JSON.stringify({ email, token }) });
      if (!otpSent) {
        otpSent = true;
        $("otp-wrap").hidden = false;
        $("login-button").textContent = "Verify and sign in";
        setMessage("login-message", result.message);
      } else {
        accessToken = result.access_token;
        adminEmail = result.user.email;
        sessionStorage.setItem("kp_admin_token", accessToken);
        sessionStorage.setItem("kp_admin_email", adminEmail);
        await showDashboard();
      }
    } catch (error) { setMessage("login-message", error.message, true); }
    finally { $("login-button").disabled = false; }
  });
  const logout = () => {
    accessToken = ""; adminEmail = "";
    sessionStorage.removeItem("kp_admin_token"); sessionStorage.removeItem("kp_admin_email");
    $("dashboard").hidden = true; $("login-panel").hidden = false;
    $("admin-otp").value = ""; otpSent = false; $("otp-wrap").hidden = true;
    $("login-button").textContent = "Send sign-in code";
  };
  $("logout-button").addEventListener("click", logout);
  const showDashboard = async () => {
    $("login-panel").hidden = true; $("dashboard").hidden = false; $("admin-user").textContent = adminEmail;
    await loadDashboard();
  };
  const renderPayments = () => {
    const query = $("payment-search").value.trim().toLowerCase();
    const status = $("payment-status-filter").value;
    const filtered = allPayments.filter(p => {
      const haystack = [p.customer?.full_name, p.customer?.email, p.description, p.tx_ref].join(" ").toLowerCase();
      return (!query || haystack.includes(query)) && (!status || p.status === status);
    });
    $("payments-body").innerHTML = filtered.length ? filtered.map(p =>
      '<tr><td>' + new Date(p.created_at).toLocaleDateString() + '</td><td>' + escapeHtml(p.customer?.full_name || p.customer?.email || "—") + '</td><td>' + escapeHtml(p.description) + '</td><td>' + money(p.amount, p.currency) + '</td><td><span class="status-pill ' + p.status + '">' + p.status + '</span></td><td>' + escapeHtml(p.tx_ref) + '</td></tr>'
    ).join("") : '<tr><td colspan="6">No matching payments.</td></tr>';
  };
  const render = data => {
    allPayments = data.payments || [];
    const s = data.summary;
    $("stats").innerHTML = [
      ["Transactions", s.total_payments], ["Successful", s.successful_payments],
      ["Pending", s.pending_payments], ["Failed / cancelled", s.failed_payments]
    ].map(([label, value]) => '<div class="stat-card"><span>' + label + '</span><strong>' + value + '</strong></div>').join("") +
    Object.entries(s.totals || {}).map(([currency, amount]) => '<div class="stat-card"><span>Collected · ' + currency + '</span><strong>' + money(amount, currency) + '</strong></div>').join("");
    renderPayments();
    $("services-list").innerHTML = data.services.length ? data.services.map(s =>
      '<div class="admin-list-item"><strong>' + escapeHtml(s.name) + '</strong><span>' +
      escapeHtml(s.category || "Professional Services") + " · " +
      (s.price_ugx == null && s.price_usd == null ? "Custom quote" : (s.price_ugx != null ? money(s.price_ugx, "UGX") : "—") + " · " + (s.price_usd != null ? money(s.price_usd, "USD") : "—")) + ' · ' + (s.active ? "Active" : "Inactive") +
      '</span><button data-service="' + s.id + '" data-active="' + (!s.active) + '">' + (s.active ? "Deactivate" : "Activate") + '</button></div>'
    ).join("") : '<p class="field-hint">No services configured.</p>';
    $("invoices-list").innerHTML = data.invoices.length ? data.invoices.map(i =>
      '<div class="admin-list-item"><strong>' + escapeHtml(i.invoice_code) + ' · ' + escapeHtml(i.customer_name) + '</strong><span>' +
      escapeHtml(i.description) + ' · ' + money(i.amount, i.currency) + ' · ' + i.status + '</span></div>'
    ).join("") : '<p class="field-hint">No invoices created.</p>';
    $("services-list").querySelectorAll("button[data-service]").forEach(button => button.addEventListener("click", async () => {
      try {
        await api("/api/admin", { method: "PATCH", body: JSON.stringify({ action: "set_service_active", id: button.dataset.service, active: button.dataset.active === "true" }) });
        await loadDashboard();
      } catch (error) { setMessage("dashboard-message", error.message, true); }
    }));
  };
  const loadDashboard = async () => {
    try { const data = await api("/api/admin"); render(data); }
    catch (error) { if (/session|sign in|authorised/i.test(error.message)) logout(); else setMessage("dashboard-message", error.message, true); }
  };
  $("payment-search").addEventListener("input", renderPayments);
  $("payment-status-filter").addEventListener("change", renderPayments);
  $("export-button").addEventListener("click", () => {
    const headers = ["Date","Customer","Email","Description","Amount","Currency","Status","Reference"];
    const rows = allPayments.map(p => [
      p.created_at, p.customer?.full_name || "", p.customer?.email || "",
      p.description || "", p.amount, p.currency, p.status, p.tx_ref
    ]);
    const csvCell = value => '"' + String(value ?? "").replace(/"/g, '""') + '"';
    const csv = [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "katende-payments-" + new Date().toISOString().slice(0,10) + ".csv";
    link.click(); URL.revokeObjectURL(url);
  });
  $("refresh-button").addEventListener("click", loadDashboard);
  $("service-form").addEventListener("submit", async event => {
    event.preventDefault();
    try {
      await api("/api/admin", { method: "POST", body: JSON.stringify({ action: "create_service", ...formData(event.currentTarget) }) });
      event.currentTarget.reset(); setMessage("service-message", "Service saved."); await loadDashboard();
    } catch (error) { setMessage("service-message", error.message, true); }
  });
  $("invoice-form").addEventListener("submit", async event => {
    event.preventDefault();
    try {
      const result = await api("/api/admin", { method: "POST", body: JSON.stringify({ action: "create_invoice", ...formData(event.currentTarget) }) });
      event.currentTarget.reset();
      setMessage("invoice-message", "Invoice created: " + result.invoice.invoice_code);
      await loadDashboard();
    } catch (error) { setMessage("invoice-message", error.message, true); }
  });
  if (accessToken) showDashboard().catch(logout);
})();
