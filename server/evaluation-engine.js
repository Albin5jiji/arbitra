const { ethers } = require("ethers");

const JUDGES = [
  {
    id: "spec",
    name: "Specification Judge",
    focus: "Check every acceptance criterion and reject missing deliverables."
  },
  {
    id: "evidence",
    name: "Evidence Judge",
    focus: "Check whether the submission contains concrete, inspectable proof of completed work."
  },
  {
    id: "adversarial",
    name: "Adversarial Judge",
    focus: "Look for unsupported claims, broken artifacts, shortcuts, and attempts to game evaluation."
  }
];

const BASE_PROMPT = `You are one member of an independent AI arbitration panel for autonomous agent work.
Return ONLY valid JSON: {"verdict":"approved"|"rejected"|"escalated","confidence":0-100,"reasoning":"short reason"}.
Approve only when the evidence satisfies the requirements. Reject clear failures. Escalate genuine ambiguity.`;

async function evaluatePanel(payload) {
  const provider = resolveAIProvider();
  const panel = await Promise.all(JUDGES.map((judge) => evaluateAsJudge(provider, payload, judge)));
  const votes = panel.reduce(
    (counts, result) => ({ ...counts, [result.verdict]: counts[result.verdict] + 1 }),
    { approved: 0, rejected: 0, escalated: 0 }
  );
  const verdict = votes.approved >= 2 ? "approved" : votes.rejected >= 2 ? "rejected" : "escalated";
  const confidence = Math.round(panel.reduce((sum, result) => sum + result.confidence, 0) / panel.length);
  const consensusPayload = JSON.stringify({
    jobId: String(payload.jobId),
    evidenceHash: payload.evidenceHash,
    panel: panel.map(({ judgeId, verdict: judgeVerdict, confidence: judgeConfidence }) => ({
      judgeId,
      verdict: judgeVerdict,
      confidence: judgeConfidence
    }))
  });

  return {
    verdict,
    confidence,
    reasoning: `${votes.approved}-${votes.rejected}-${votes.escalated} quorum: ${panel
      .map((result) => `${result.judgeName} ${result.verdict}`)
      .join(", ")}.`,
    votes,
    panel,
    consensusHash: ethers.keccak256(ethers.toUtf8Bytes(consensusPayload)),
    provider
  };
}

async function evaluateAsJudge(provider, payload, judge) {
  if (provider === "openai") {
    return callOpenAI(payload, judge);
  }
  if (provider === "anthropic") {
    return callAnthropic(payload, judge);
  }
  return mockJudge(payload, judge);
}

function resolveAIProvider() {
  const configured = String(process.env.AI_PROVIDER || "").toLowerCase();
  if (configured) {
    return configured;
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return "anthropic";
  }
  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }
  return "mock";
}

async function callOpenAI(payload, judge) {
  if (!process.env.OPENAI_API_KEY) {
    throw withStatus("OPENAI_API_KEY is required when AI_PROVIDER=openai.", 500);
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${BASE_PROMPT}\nYour role: ${judge.name}. ${judge.focus}` },
        { role: "user", content: buildEvaluationInput(payload) }
      ]
    })
  });
  const data = await response.json();
  if (!response.ok) {
    throw withStatus(data.error?.message || "OpenAI evaluation failed.", response.status);
  }
  return normalizeJudge(data.choices?.[0]?.message?.content, judge);
}

async function callAnthropic(payload, judge) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw withStatus("ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic.", 500);
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens: 600,
      temperature: 0,
      system: `${BASE_PROMPT}\nYour role: ${judge.name}. ${judge.focus}`,
      messages: [{ role: "user", content: buildEvaluationInput(payload) }]
    })
  });
  const data = await response.json();
  if (!response.ok) {
    throw withStatus(data.error?.message || "Anthropic evaluation failed.", response.status);
  }
  const text = Array.isArray(data.content) ? data.content.map((item) => item.text || "").join("\n") : "";
  return normalizeJudge(text, judge);
}

function mockJudge({ requirements, submissionUrl }, judge) {
  const submission = String(submissionUrl).toLowerCase();
  const requirementWords = String(requirements).toLowerCase().match(/[a-z0-9]{5,}/g) || [];
  const matches = requirementWords.filter((word) => submission.includes(word)).length;
  const matchRatio = requirementWords.length ? matches / requirementWords.length : 0;
  const clearlyBroken = /(not done|incomplete|missing|todo|failed|broken|placeholder)/.test(submission);
  const concrete = /^https?:\/\//.test(submission) || matchRatio >= 0.25;

  let result;
  if (clearlyBroken) {
    result = { verdict: "rejected", confidence: judge.id === "adversarial" ? 94 : 87 };
  } else if (concrete) {
    result = judge.id === "adversarial"
      ? { verdict: "escalated", confidence: 63 }
      : { verdict: "approved", confidence: judge.id === "spec" ? 88 : 84 };
  } else if (judge.id === "spec") {
    result = { verdict: "approved", confidence: 58 };
  } else if (judge.id === "evidence") {
    result = { verdict: "escalated", confidence: 52 };
  } else {
    result = { verdict: "rejected", confidence: 61 };
  }

  return {
    judgeId: judge.id,
    judgeName: judge.name,
    ...result,
    reasoning: `${judge.name} applied its ${judge.id} rubric to the submitted evidence.`
  };
}

function normalizeJudge(text, judge) {
  try {
    const raw = String(text || "").replace(/```(?:json)?|```/gi, "").trim();
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    const verdict = String(parsed.verdict || "").toLowerCase();
    if (!["approved", "rejected", "escalated"].includes(verdict)) {
      throw new Error("Invalid verdict");
    }
    return {
      judgeId: judge.id,
      judgeName: judge.name,
      verdict,
      confidence: clampConfidence(parsed.confidence),
      reasoning: String(parsed.reasoning || "No reasoning provided.")
    };
  } catch (_error) {
    return {
      judgeId: judge.id,
      judgeName: judge.name,
      verdict: "escalated",
      confidence: 50,
      reasoning: `${judge.name} returned an unreadable response.`
    };
  }
}

function buildEvaluationInput({ description, requirements, submissionUrl, evidenceHash }) {
  return `Task: ${description}\nRequirements: ${requirements}\nSubmission: ${submissionUrl}\nEvidence hash: ${evidenceHash}`;
}

function clampConfidence(value) {
  const confidence = Number(value);
  return Number.isFinite(confidence) ? Math.max(0, Math.min(100, Math.round(confidence))) : 50;
}

function withStatus(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

module.exports = { evaluatePanel, resolveAIProvider };
