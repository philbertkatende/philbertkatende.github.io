(() => {
  const $ = id => document.getElementById(id);
  const API_BASE = location.hostname.endsWith("github.io") ? "https://philbertkatendegithubio.vercel.app" : "";
  const params = new URLSearchParams(location.search);
  const txRef = params.get("tx_ref") || sessionStorage.getItem("kp_tx_ref") || "";
  const transactionId = params.get("transaction_id") || "";
  const status = params.get("status") || "";
  const money = (amount, currency) => new Intl.NumberFormat("en-UG", { style: "currency", currency, maximumFractionDigits: currency === "UGX" ? 0 : 2 }).format(Number(amount));
  const show = (title, message, details, ref) => {
    $("result-title").textContent = title;
    $("result-message").textContent = message;
    $("result-ref").textContent = ref ? "Reference: " + ref : "";
    if (details) {
      $("result-details").hidden = false;
      $("result-details").innerHTML = "<span>" + details.description + "</span><strong>" + money(details.amount, details.currency) + "</strong>";
    }
  };
  (async () => {
    if (!txRef) return show("Reference not found", "We could not identify this payment. Please contact me if money was deducted.");
    try {
      if (status === "successful" && transactionId) {
        const verify = await fetch(API_BASE + "/api/verify-payment?tx_ref=" + encodeURIComponent(txRef) + "&transaction_id=" + encodeURIComponent(transactionId));
        const result = await verify.json();
        if (!verify.ok) throw new Error(result.error || "The provider has not confirmed this payment.");
      }
      const response = await fetch(API_BASE + "/api/payment-status?tx_ref=" + encodeURIComponent(txRef));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to retrieve payment status.");
      if (data.status === "successful") {
        show("Payment confirmed", "Thank you. The payment provider has confirmed your payment. Keep your reference for your records.", data, txRef);
        if (data.receipt) $("result-ref").textContent += " · Receipt: " + data.receipt.receipt_number;
      } else if (data.status === "pending" || data.status === "initiated") {
        show("Payment is being processed", "Your payment is not yet confirmed. Mobile-money transactions can take time. Refresh this page shortly; do not pay twice.", data, txRef);
      } else {
        show("Payment not completed", "The transaction is currently marked as " + data.status + ". If you believe you were charged, contact me with this reference.", data, txRef);
      }
    } catch (error) {
      show("We are still checking", error.message + " If money was deducted, do not repeat the payment until the status is confirmed.", null, txRef);
    }
  })();
})();
