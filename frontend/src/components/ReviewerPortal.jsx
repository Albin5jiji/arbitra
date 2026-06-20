import React, { useMemo, useState } from "react";
import { CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import {
  extractErrorMessage,
  getSignerContract,
  JOB_STATUS
} from "../utils/contract.js";
import WalletReputation from "./WalletReputation.jsx";
import ConsensusPanel from "./ConsensusPanel.jsx";

export default function ReviewerPortal({ jobs, evaluations, reputation, loading, isOwner, onRefresh, onNotice }) {
  const [pendingJobId, setPendingJobId] = useState(null);

  const escalatedJobs = useMemo(() => jobs.filter((job) => job.status === JOB_STATUS.Escalated), [jobs]);

  const decide = async (jobId, approved) => {
    setPendingJobId(jobId);

    try {
      const contract = await getSignerContract();
      const tx = approved ? await contract.approveByReviewer(jobId) : await contract.rejectByReviewer(jobId);
      onNotice({ type: "success", text: approved ? "Approval transaction sent." : "Rejection transaction sent." });
      await tx.wait();
      onNotice({ type: "success", text: approved ? "Escalated job approved." : "Escalated job rejected." });
      await onRefresh();
    } catch (error) {
      onNotice({ type: "error", text: extractErrorMessage(error) });
    } finally {
      setPendingJobId(null);
    }
  };

  return (
    <section className="single-panel">
      <div className="panel-title">
        <ShieldAlert size={20} />
        <h2>Challenge Arbitration</h2>
      </div>

      {!isOwner && <p className="muted">Connect the arbitration wallet to resolve tasks where no judge verdict reached quorum.</p>}
      {loading && <p className="muted">Loading escalations...</p>}
      {!loading && escalatedJobs.length === 0 && <p className="muted">No escalated jobs waiting for review.</p>}

      <div className="job-list two-column">
        {escalatedJobs.map((job) => {
          const evaluation = evaluations[job.id];
          const pending = pendingJobId === job.id;

          return (
            <article className="job-card" key={job.id}>
              <div className="job-card-header">
                <div>
                  <span className="job-id">Job #{job.id}</span>
                  <h3>{job.description}</h3>
                </div>
                <span className="status-pill status-escalated">Escalated</span>
              </div>

              <dl className="job-meta">
                <div>
                  <dt>Client</dt>
                  <dd>
                    <WalletReputation address={job.client} reputation={reputation} />
                  </dd>
                </div>
                <div>
                  <dt>Freelancer</dt>
                  <dd>
                    <WalletReputation address={job.freelancer} reputation={reputation} skill={job.skill} />
                  </dd>
                </div>
                <div>
                  <dt>Confidence</dt>
                  <dd>{evaluation?.confidence ?? "Pending"}%</dd>
                </div>
              </dl>

              <p className="requirements-text">{job.requirements}</p>
              <p className="submission-preview">
                <strong>Submission:</strong> {job.submissionUrl || "No submission recorded"}
              </p>
              <p className="reasoning-text">{evaluation?.reasoning || "No AI reasoning has been stored for this job."}</p>
              <ConsensusPanel job={job} evaluation={evaluation} />

              <div className="button-row">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => decide(job.id, true)}
                  disabled={!isOwner || pending}
                >
                  <CheckCircle2 size={18} />
                  Settle to Worker
                </button>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => decide(job.id, false)}
                  disabled={!isOwner || pending}
                >
                  <XCircle size={18} />
                  Refund + Slash Stake
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
