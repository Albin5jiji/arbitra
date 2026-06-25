export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export async function postEvaluation(payload) {
  return requestJson("/api/evaluate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function fetchEvaluation(jobId) {
  const data = await requestJson(`/api/evaluation/${jobId}`);
  return data.evaluation;
}

export async function fetchX402Config() {
  return requestJson("/api/x402/config");
}

export async function probeX402Report(jobId) {
  const response = await fetch(`${API_BASE_URL}/api/x402/report/${jobId}`, {
    headers: { Accept: "application/json" }
  });
  const data = await response.json().catch(() => ({}));
  return {
    status: response.status,
    paymentRequired: response.headers.get("payment-required") || response.headers.get("x-payment-required") || "",
    data
  };
}

async function requestJson(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, options);
  } catch (_error) {
    throw new Error("Arbitra API is offline. Start the full app with npm run dev.");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const fallback =
      response.status === 500
        ? "Arbitra API failed. For local development, start both services with npm run dev."
        : `Request failed with status ${response.status}`;
    throw new Error(data.error || fallback);
  }

  return data;
}
