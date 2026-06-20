import React from "react";
import { Bot, CheckCircle2, Fingerprint, ShieldAlert, XCircle } from "lucide-react";

const VERDICT_ICONS = {
  approved: CheckCircle2,
  rejected: XCircle,
  escalated: ShieldAlert
};

export default function ConsensusPanel({ job, evaluation }) {
  const hasReceipt = job.evidenceHash && !/^0x0+$/.test(job.evidenceHash);
  const panel = evaluation?.panel || [];

  if (!hasReceipt && panel.length === 0) {
    return null;
  }

  return (
    <section className="consensus-panel">
      <div className="receipt-header">
        <span><Fingerprint size={17} /> Verifiable execution receipt</span>
        <span className="quorum-badge">2-of-3 quorum</span>
      </div>

      <div className="hash-grid">
        <div>
          <span>Evidence</span>
          <code title={job.evidenceHash}>{shortHash(job.evidenceHash)}</code>
        </div>
        <div>
          <span>Consensus</span>
          <code title={job.consensusHash}>{shortHash(job.consensusHash)}</code>
        </div>
      </div>

      {panel.length > 0 && (
        <div className="judge-grid">
          {panel.map((judge) => {
            const Icon = VERDICT_ICONS[judge.verdict] || Bot;
            return (
              <article className={`judge-card judge-${judge.verdict}`} key={judge.judgeId}>
                <div><Icon size={16} /> {judge.judgeName}</div>
                <strong>{judge.verdict} · {judge.confidence}%</strong>
                <p>{judge.reasoning}</p>
              </article>
            );
          })}
        </div>
      )}

      {(job.votes?.approved + job.votes?.rejected + job.votes?.escalated > 0) && (
        <div className="vote-strip">
          <span>Approve {job.votes.approved}</span>
          <span>Reject {job.votes.rejected}</span>
          <span>Escalate {job.votes.escalated}</span>
        </div>
      )}
    </section>
  );
}

function shortHash(value) {
  if (!value || /^0x0+$/.test(value)) {
    return "Pending";
  }
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}
