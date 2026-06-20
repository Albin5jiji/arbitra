import React, { useEffect, useMemo, useState } from "react";
import { Bot, Code2, CreditCard, RadioTower } from "lucide-react";
import { fetchX402Config, probeX402Report } from "../utils/api.js";

export default function AgentApiPortal({ jobs, onNotice }) {
  const [config, setConfig] = useState(null);
  const [jobId, setJobId] = useState("");
  const [probe, setProbe] = useState(null);
  const [pending, setPending] = useState(false);
  const evaluatedJobs = useMemo(
    () => jobs.filter((job) => job.consensusHash && !/^0x0+$/.test(job.consensusHash)),
    [jobs]
  );

  useEffect(() => {
    fetchX402Config()
      .then((nextConfig) => setConfig(nextConfig))
      .catch((error) => onNotice({ type: "error", text: error.message }));
  }, [onNotice]);

  useEffect(() => {
    if (!jobId && evaluatedJobs[0]) {
      setJobId(evaluatedJobs[0].id);
    }
  }, [evaluatedJobs, jobId]);

  const probeEndpoint = async () => {
    if (jobId === "") {
      onNotice({ type: "warning", text: "Enter an evaluated task ID." });
      return;
    }
    setPending(true);
    try {
      const result = await probeX402Report(jobId);
      setProbe(result);
      onNotice({
        type: result.status === 402 ? "success" : "warning",
        text: result.status === 402 ? "HTTP 402 challenge received. An agent can now sign and retry." : `Endpoint returned HTTP ${result.status}.`
      });
    } catch (error) {
      onNotice({ type: "error", text: error.message });
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="api-portal">
      <div className="api-hero">
        <div className="api-icon"><RadioTower size={28} /></div>
        <div>
          <p className="eyebrow">Agent-to-agent commerce</p>
          <h2>x402 Arbitration API</h2>
          <p>Agents purchase signed judge transcripts over HTTP—no account, API key, invoice, or human checkout.</p>
        </div>
      </div>

      <div className="api-grid">
        <article className="api-card">
          <CreditCard size={20} />
          <h3>Payment Requirement</h3>
          <dl className="api-definition">
            <div><dt>Protocol</dt><dd>{config?.protocol || "x402-v2"}</dd></div>
            <div><dt>Price</dt><dd>{config?.price || "$0.01"}</dd></div>
            <div><dt>Network</dt><dd>{config?.network || "Loading"}</dd></div>
            <div><dt>Facilitator</dt><dd>{config?.facilitatorUrl || "Loading"}</dd></div>
          </dl>
        </article>

        <article className="api-card">
          <Bot size={20} />
          <h3>Probe as an Agent</h3>
          <label>
            Evaluated task ID
            <input value={jobId} onChange={(event) => setJobId(event.target.value)} placeholder="0" />
          </label>
          <button className="primary-button" type="button" onClick={probeEndpoint} disabled={pending}>
            <Code2 size={18} /> {pending ? "Requesting..." : "Request Premium Report"}
          </button>
        </article>
      </div>

      <article className="x402-terminal">
        <div><span className="terminal-dot red" /><span className="terminal-dot amber" /><span className="terminal-dot green" /> agent request</div>
        <code>GET /api/x402/report/{jobId || ":jobId"}</code>
        {probe ? (
          <pre>{JSON.stringify({ status: probe.status, paymentRequired: probe.paymentRequired || "included in response body", body: probe.data }, null, 2)}</pre>
        ) : (
          <p>First request returns HTTP 402. The agent signs the offered payment, retries with PAYMENT-SIGNATURE, and receives the report.</p>
        )}
      </article>
    </section>
  );
}
