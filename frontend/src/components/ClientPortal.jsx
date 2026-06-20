import React, { useMemo, useState } from "react";
import { LockKeyhole, Send, ShieldCheck, WalletCards, XCircle } from "lucide-react";
import { ethers } from "ethers";
import {
  extractErrorMessage,
  formatStatusClass,
  getSignerContract,
  JOB_STATUS,
  sameAddress,
  shortenAddress
} from "../utils/contract.js";
import ConsensusPanel from "./ConsensusPanel.jsx";
import WalletReputation from "./WalletReputation.jsx";

const INITIAL_FORM = {
  freelancer: "",
  description: "",
  requirements: "",
  skill: "frontend",
  amount: "0.01",
  stake: "0.002"
};

export default function ClientPortal({ account, jobs, evaluations, reputation, loading, onRefresh, onNotice }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [pending, setPending] = useState(false);
  const [cancellingJobId, setCancellingJobId] = useState(null);
  const clientJobs = useMemo(() => jobs.filter((job) => sameAddress(job.client, account)), [account, jobs]);

  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const createJob = async (event) => {
    event.preventDefault();
    setPending(true);
    try {
      if (!ethers.isAddress(form.freelancer)) {
        throw new Error("Enter a valid worker-agent wallet address.");
      }
      if (!form.description.trim() || !form.requirements.trim() || !form.skill.trim()) {
        throw new Error("Add a task, verification requirements, and skill category.");
      }

      const contract = await getSignerContract();
      const tx = await contract.createJob(
        form.freelancer,
        form.description.trim(),
        form.requirements.trim(),
        form.skill.trim(),
        ethers.parseEther(form.stake || "0"),
        { value: ethers.parseEther(form.amount || "0") }
      );
      onNotice({ type: "success", text: "Task funding transaction submitted." });
      await tx.wait();
      onNotice({ type: "success", text: "Agent task funded. Worker stake is now required." });
      setForm(INITIAL_FORM);
      await onRefresh();
    } catch (error) {
      onNotice({ type: "error", text: extractErrorMessage(error) });
    } finally {
      setPending(false);
    }
  };

  const cancelJob = async (jobId) => {
    setCancellingJobId(jobId);
    try {
      const tx = await (await getSignerContract()).cancelJob(jobId);
      await tx.wait();
      onNotice({ type: "success", text: "Unaccepted task cancelled and funding returned." });
      await onRefresh();
    } catch (error) {
      onNotice({ type: "error", text: extractErrorMessage(error) });
    } finally {
      setCancellingJobId(null);
    }
  };

  return (
    <section className="portal-grid">
      <form className="form-panel" onSubmit={createJob}>
        <div className="panel-title">
          <LockKeyhole size={20} />
          <h2>Fund Agent Task</h2>
        </div>

        <label>
          Worker-agent wallet
          <input value={form.freelancer} onChange={(event) => updateForm("freelancer", event.target.value)} placeholder="0x..." />
        </label>
        <label>
          Task
          <input value={form.description} onChange={(event) => updateForm("description", event.target.value)} placeholder="Audit a smart contract and return findings" />
        </label>
        <label>
          Machine-checkable requirements
          <textarea rows="6" value={form.requirements} onChange={(event) => updateForm("requirements", event.target.value)} placeholder="Artifact URL, required sections, pass conditions, and evidence format." />
        </label>
        <div className="form-row">
          <label>
            Skill passport
            <input value={form.skill} onChange={(event) => updateForm("skill", event.target.value)} placeholder="security" />
          </label>
          <label>
            Payment (MON)
            <input min="0" step="0.001" type="number" value={form.amount} onChange={(event) => updateForm("amount", event.target.value)} />
          </label>
        </div>
        <label>
          Required worker stake (MON)
          <input min="0" step="0.001" type="number" value={form.stake} onChange={(event) => updateForm("stake", event.target.value)} />
        </label>

        <div className="settlement-note">
          <ShieldCheck size={18} />
          A 2-of-3 AI quorum releases payment automatically. Rejected work forfeits the worker stake.
        </div>
        <button className="primary-button full-width" type="submit" disabled={pending}>
          <Send size={18} />
          {pending ? "Funding..." : "Fund Autonomous Task"}
        </button>
      </form>

      <div className="jobs-panel">
        <div className="panel-title"><WalletCards size={20} /><h2>Requested Tasks</h2></div>
        {loading && <p className="muted">Loading tasks...</p>}
        {!loading && clientJobs.length === 0 && <p className="muted">No tasks created by {shortenAddress(account)}.</p>}

        <div className="job-list">
          {clientJobs.map((job) => {
            const evaluation = evaluations[job.id];
            return (
              <article className="job-card" key={job.id}>
                <div className="job-card-header">
                  <div><span className="job-id">Task #{job.id} · {job.skill}</span><h3>{job.description}</h3></div>
                  <span className={`status-pill status-${formatStatusClass(job.statusLabel)}`}>{job.statusLabel}</span>
                </div>
                <dl className="job-meta">
                  <div><dt>Worker Agent</dt><dd><WalletReputation address={job.freelancer} reputation={reputation} skill={job.skill} /></dd></div>
                  <div><dt>Payment</dt><dd>{job.amountMon} MON</dd></div>
                  <div><dt>Worker Stake</dt><dd>{job.stakeLockedMon || job.stakeRequiredMon} / {job.stakeRequiredMon} MON</dd></div>
                </dl>
                <p className="requirements-text">{job.requirements}</p>
                {evaluation?.reasoning && <p className="reasoning-text">{evaluation.reasoning}</p>}
                <ConsensusPanel job={job} evaluation={evaluation} />
                {job.status === JOB_STATUS.Open && (
                  <button className="danger-button" type="button" onClick={() => cancelJob(job.id)} disabled={cancellingJobId === job.id}>
                    <XCircle size={18} /> {cancellingJobId === job.id ? "Cancelling..." : "Cancel Before Acceptance"}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
