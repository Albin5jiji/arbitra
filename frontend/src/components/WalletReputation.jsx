import React from "react";
import { shortenAddress } from "../utils/contract.js";

export default function WalletReputation({ address, reputation, skill }) {
  const score = reputation?.[address?.toLowerCase?.()] ?? 0;
  const skillScore = skill ? reputation?.[`skill:${address?.toLowerCase?.()}:${skill.toLowerCase()}`] ?? 0 : null;
  const scoreLabel = score > 0 ? `+${score}` : `${score}`;
  const tone = score > 0 ? "positive" : score < 0 ? "negative" : "neutral";

  return (
    <span className="wallet-reputation">
      <span>{shortenAddress(address)}</span>
      <span className={`rep-badge rep-${tone}`}>Rep {scoreLabel}</span>
      {skillScore !== null && <span className="rep-badge rep-skill">{skill} {skillScore > 0 ? `+${skillScore}` : skillScore}</span>}
    </span>
  );
}
