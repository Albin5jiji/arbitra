import React, { useMemo, useState } from "react";
import { Bot, Fingerprint, HandCoins, Send, UploadCloud } from "lucide-react";
import { postEvaluation } from "../utils/api.js";
import {
  createEvidenceHash,
  extractErrorMessage,
  formatStatusClass,
  getSignerContract,
  JOB_STATUS,
  sameAddress,
  shortenAddress
} from "../utils/contract.js";
import ConsensusPanel from "./ConsensusPanel.jsx";
import WalletReputation from "./WalletReputation.jsx";

export default function FreelancerPortal({ account, jobs, evaluations, reputation, loading, onRefresh, onNotice }) {
  const [submissions, setSubmissions] = useState({});
  const [pendingJobId, setPendingJobId] = useState(null);
  const assignedJobs = useMemo(() => jobs.filter((job) => sameAddress(job.freelancer, account)), [account, jobs]);

  const acceptJob = async (job) => {
    setPendingJobId(job.id);
    try {
      const tx = await (await getSignerContract()).acceptJob(job.id, { value: BigInt(job.stakeRequiredWei) });
      onNotice({ type: "success", text: "Stake transaction submitted." });
      await tx.wait();
      onNotice({ type: "success", text: `${job.stakeRequiredMon} MON staked. The agent can now execute.` });
      await onRefresh();
    } catch (error) {
      onNotice({ type: "error", text: extractErrorMessage(error) });
    } finally {
      setPendingJobId(null);
    }
  };

  const submitWork = async (job, retryEvaluation = false) => {
    const submissionUrl = (submissions[job.id] ?? job.submissionUrl ?? "").trim();
    setPendingJobId(job.id);
    try {
      if (!submissionUrl) {
        throw new Error("Add an artifact URL or execution summary.");
      }

      const evidenceHash = retryEvaluation ? job.evidenceHash : createEvidenceHash(job, submissionUrl);
      if (!retryEvaluation) {
        const tx = await (await getSignerContract()).submitWork(job.id, submissionUrl, evidenceHash);
        onNotice({ type: "success", text: "Execution receipt submitted on-chain." });
        await tx.wait();
      }

      onNotice({ type: "success", text: "Three independent judge agents are evaluating the proof." });
      const verdict = await postEvaluation({
        jobId: job.id,
        description: job.description,
        requirements: job.requirements,
        submissionUrl,
        evidenceHash
      });
      onNotice({
        type: verdict.verdict === "approved" ? "success" : "warning",
        text: `Panel verdict: ${verdict.verdict} (${verdict.votes.approved}-${verdict.votes.rejected}-${verdict.votes.escalated}). Settlement recorded.`
      });
      await onRefresh();
    } catch (error) {
      onNotice({ type: "error", text: extractErrorMessage(error) });
    } finally {
      setPendingJobId(null);
    }
  };

  return (
    <section className="single-panel">
      <div className="panel-title"><UploadCloud size={20} /><h2>Worker Agent Queue</h2></div>
      {loading && <p className="muted">Loading agent tasks...</p>}
      {!loading && assignedJobs.length === 0 && <p className="muted">No tasks assigned to {shortenAddress(account)}.</p>}

      <div className="job-list two-column">
        {assignedJobs.map((job) => {
          const evaluation = evaluations[job.id];
          const pending = pendingJobId === job.id;
          const canSubmit = job.status === JOB_STATUS.Accepted;
          const canRetry = job.status === JOB_STATUS.Submitted;

          return (
            <article className="job-card" key={job.id}>
              <div className="job-card-header">
                <div><span className="job-id">Task #{job.id} · {job.skill}</span><h3>{job.description}</h3></div>
                <span className={`status-pill status-${formatStatusClass(job.statusLabel)}`}>{job.statusLabel}</span>
              </div>
              <p className="requirements-text">{job.requirements}</p>
              <dl className="job-meta">
                <div><dt>Requester</dt><dd><WalletReputation address={job.client} reputation={reputation} /></dd></div>
                <div><dt>Payment</dt><dd>{job.amountMon} MON</dd></div>
                <div><dt>Stake at Risk</dt><dd>{job.stakeRequiredMon} MON</dd></div>
              </dl>

              {job.status === JOB_STATUS.Open && (
                <button className="primary-button" type="button" onClick={() => acceptJob(job)} disabled={pending}>
                  <HandCoins size={18} /> {pending ? "Staking..." : `Accept + Stake ${job.stakeRequiredMon} MON`}
                </button>
              )}

              {(canSubmit || canRetry) && (
                <div className="submission-box">
                  <label>
                    Artifact URL or execution summary
                    <textarea rows="4" value={submissions[job.id] ?? job.submissionUrl ?? ""} onChange={(event) => setSubmissions((current) => ({ ...current, [job.id]: event.target.value }))} placeholder="https://github.com/... plus a concise proof of completed work" />
                  </label>
                  <div className="settlement-note"><Fingerprint size={18} /> Arbitra hashes this evidence before the judge panel sees it.</div>
                  <button className="primary-button" type="button" onClick={() => submitWork(job, canRetry)} disabled={pending}>
                    {canRetry ? <Bot size={18} /> : <Send size={18} />}
                    {pending ? "Running quorum..." : canRetry ? "Retry Judge Quorum" : "Submit Proof + Run Quorum"}
                  </button>
                </div>
              )}

              {job.submissionUrl && <p className="submission-preview"><strong>Artifact:</strong> {job.submissionUrl}</p>}
              {evaluation?.reasoning && <p className="reasoning-text">{evaluation.reasoning}</p>}
              <ConsensusPanel job={job} evaluation={evaluation} />
              <WalletReputation address={job.freelancer} reputation={reputation} skill={job.skill} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
