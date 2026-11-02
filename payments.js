(() => {
  const $ = id => document.getElementById(id);
  const API_BASE = location.hostname.endsWith("github.io") ? "https://philbertkatendegithubio.vercel.app" : "";
  const form = $("checkout-form");
  if (!form) return;
  const state = { mode: "service", services: [], invoice: null };
  const money = (amount, currency) => new Intl.NumberFormat("en-UG", { style: "currency", currency, maximumFractionDigits: currency === "UGX" ? 0 : 2 }).format(Number(amount));
  const message = (text, kind = "") => { $("checkout-message").textContent = text; $("checkout-message").className = "form-message " + kind; };
  const selectedService = () => state.services.find(s => s.id === $("service-select").value);
  const renderPrice = () => {
    const currency = $("currency").value;
    if (state.mode === "invoice") {
      const inv = state.invoice;
      $("price-summary").innerHTML = inv
        ? '<span>Amount due</span><strong>' + money(inv.amount, inv.currency) + '</strong>'
        : '<span>Amount due</span><strong>Find an invoice</strong>';
      $("currency").disabled = Boolean(inv);
      return;
    }
    $("currency").disabled = false;
    const service = selectedService();
    const price = service && (currency === "UGX" ? service.price_ugx : service.price_usd);
    $("price-summary").innerHTML = '<span>Amount due</span><strong>' + (price == null ? "Ask for a quote" : money(price, currency)) + '</strong>';
    $("service-description").textContent = service ? service.description : "";
  };
  const loadServices = async () => {
    try {
      const response = await fetch(API_BASE + "/api/services");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load services.");
      state.services = data.services || [];
      $("service-select").innerHTML = '<option value="">Select a service</option>' + state.services.map(s =>
        '<option value="' + s.id + '">' + s.name.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])) + '</option>'
      ).join("");
      renderPrice();
    } catch (error) {
      $("service-select").innerHTML = '<option value="">Services are temporarily unavailable</option>';
      message(error.message, "error");
    }
  };
  document.querySelectorAll(".payment-tab").forEach(button => button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    state.invoice = null;
    document.querySelectorAll(".payment-tab").forEach(x => x.classList.toggle("active", x === button));
    $("service-mode").hidden = state.mode !== "service";
    $("invoice-mode").hidden = state.mode !== "invoice";
    $("invoice-preview").textContent = "Enter the reference shown on your invoice.";
    renderPrice();
  }));
  $("service-select").addEventListener("change", renderPrice);
  $("currency").addEventListener("change", renderPrice);
  $("lookup-invoice").addEventListener("click", async () => {
    const code = $("invoice-code").value.trim().toUpperCase();
    if (!code) return;
    $("invoice-preview").textContent = "Looking up invoice…";
    try {
      const response = await fetch(API_BASE + "/api/invoice-preview?invoice_code=" + encodeURIComponent(code));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Invoice not found.");
      state.invoice = data.invoice;
      $("currency").value = state.invoice.currency;
      $("invoice-preview").textContent = state.invoice.description + " · " + state.invoice.status;
      renderPrice();
    } catch (error) {
      state.invoice = null;
      $("invoice-preview").textContent = error.message;
      renderPrice();
    }
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const service = state.mode === "service" ? selectedService() : null;
    if (state.mode === "service" && !service) return message("Select a service first.", "error");
    if (state.mode === "invoice" && !state.invoice) return message("Look up a valid invoice first.", "error");
    const currency = $("currency").value;
    if (service && (currency === "UGX" ? service.price_ugx : service.price_usd) == null) return message("This service has no listed price in the selected currency. Please request a quote.", "error");
    const button = $("pay-button");
    button.disabled = true;
    button.textContent = "Preparing secure checkout…";
    message("");
    try {
      const payload = {
        full_name: $("full-name").value.trim(),
        email: $("email").value.trim(),
        phone: $("phone").value.trim(),
        currency,
        service_id: service ? service.id : undefined,
        invoice_code: state.mode === "invoice" ? state.invoice.invoice_code : undefined
      };
      const response = await fetch(API_BASE + "/api/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to start checkout.");
      sessionStorage.setItem("kp_tx_ref", data.tx_ref);
      window.location.assign(data.checkout_url);
    } catch (error) {
      message(error.message, "error");
      button.disabled = false;
      button.textContent = "Continue to secure checkout";
    }
  });
  loadServices();
})();
