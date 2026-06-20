import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Bot, BrainCircuit, BriefcaseBusiness, RadioTower, RefreshCw, Scale, ShieldCheck, Wallet } from "lucide-react";
import AgentApiPortal from "./components/AgentApiPortal.jsx";
import ClientPortal from "./components/ClientPortal.jsx";
import FreelancerPortal from "./components/FreelancerPortal.jsx";
import ReviewerPortal from "./components/ReviewerPortal.jsx";
import { fetchEvaluation } from "./utils/api.js";
import {
  CONTRACT_ADDRESS,
  ensureMonadNetwork,
  extractErrorMessage,
  getBrowserProvider,
  getReadContract,
  isContractConfigured,
  normalizeJob,
  sameAddress,
  shortenAddress
} from "./utils/contract.js";

const TABS = [
  { id: "client", label: "Requester Agent", icon: BriefcaseBusiness },
  { id: "freelancer", label: "Worker Agent", icon: Bot },
  { id: "reviewer", label: "Arbitration", icon: Scale },
  { id: "x402", label: "x402 Agent API", icon: RadioTower }
];

export default function App() {
  const [activeTab, setActiveTab] = useState("client");
  const [account, setAccount] = useState("");
  const [owner, setOwner] = useState("");
  const [jobs, setJobs] = useState([]);
  const [evaluations, setEvaluations] = useState({});
  const [reputation, setReputation] = useState({});
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [notice, setNotice] = useState(null);

  const loadJobs = useCallback(async () => {
    if (!isContractConfigured()) {
      setJobs([]);
      setEvaluations({});
      setReputation({});
      return;
    }

    setLoadingJobs(true);
    try {
      const contract = getReadContract();
      const [count, contractOwner] = await Promise.all([contract.jobCount(), contract.owner()]);
      setOwner(contractOwner);

      const ids = Array.from({ length: Number(count) }, (_item, index) => index);
      const loadedJobs = await Promise.all(ids.map(async (id) => normalizeJob(id, await contract.getJob(id))));
      const loadedReputation = await loadReputation(contract, loadedJobs);
      const loadedEvaluations = await Promise.all(
        ids.map(async (id) => {
          try {
            return [id.toString(), await fetchEvaluation(id)];
          } catch (_error) {
            return [id.toString(), null];
          }
        })
      );

      setJobs(loadedJobs);
      setReputation(loadedReputation);
      setEvaluations(Object.fromEntries(loadedEvaluations));
    } catch (error) {
      setNotice({ type: "error", text: extractErrorMessage(error) });
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    if (!window.ethereum) {
      return undefined;
    }

    window.ethereum
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        if (accounts[0]) {
          setAccount(accounts[0]);
        }
      })
      .catch(() => {});

    const handleAccountsChanged = (accounts) => {
      setAccount(accounts[0] || "");
    };
    const handleChainChanged = () => {
      loadJobs();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
  }, [loadJobs]);

  useEffect(() => {
    loadJobs();
  }, [account, loadJobs]);

  const connectWallet = async () => {
    try {
      await ensureMonadNetwork();
      const provider = getBrowserProvider();
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0] || "");
      setNotice({ type: "success", text: "Wallet connected on Monad testnet." });
    } catch (error) {
      setNotice({ type: "error", text: extractErrorMessage(error) });
    }
  };

  const activePortal = useMemo(() => {
    const sharedProps = {
      account,
      jobs,
      evaluations,
      reputation,
      loading: loadingJobs,
      onRefresh: loadJobs,
      onNotice: setNotice
    };

    if (activeTab === "freelancer") {
      return <FreelancerPortal {...sharedProps} />;
    }
    if (activeTab === "reviewer") {
      return <ReviewerPortal {...sharedProps} isOwner={sameAddress(account, owner)} />;
    }
    if (activeTab === "x402") {
      return <AgentApiPortal {...sharedProps} />;
    }
    return <ClientPortal {...sharedProps} />;
  }, [account, activeTab, evaluations, jobs, loadJobs, loadingJobs, owner, reputation]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <div className="brand-mark">
            <ShieldCheck size={24} />
          </div>
          <div>
            <p className="eyebrow">Autonomous trust on Monad</p>
            <h1>Arbitra</h1>
          </div>
        </div>

        <div className="header-actions">
          <button className="ghost-button" type="button" onClick={loadJobs} disabled={loadingJobs}>
            <RefreshCw size={18} />
            Refresh
          </button>
          <button className="primary-button" type="button" onClick={connectWallet}>
            <Wallet size={18} />
            {account ? shortenAddress(account) : "Connect Wallet"}
          </button>
        </div>
      </header>

      {!isContractConfigured() && (
        <div className="notice notice-error">
          <AlertCircle size={18} />
          Set VITE_CONTRACT_ADDRESS in frontend/.env after deploying PayGuard.
        </div>
      )}

      {notice && (
        <div className={`notice notice-${notice.type}`}>
          <AlertCircle size={18} />
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      <section className="network-summary" aria-label="Arbitra network summary">
        <div>
          <BrainCircuit size={18} />
          <span><strong>3</strong> independent judges</span>
        </div>
        <div>
          <ShieldCheck size={18} />
          <span><strong>{jobs.filter((job) => job.statusLabel === "Settled").length}</strong> autonomous settlements</span>
        </div>
        <div>
          <Bot size={18} />
          <span><strong>{jobs.length}</strong> agent tasks on-chain</span>
        </div>
      </section>

      <nav className="tabs" aria-label="Arbitra portals">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              className={activeTab === tab.id ? "tab-button active" : "tab-button"}
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={18} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <main className="portal-frame">{account ? activePortal : <EmptyConnectState onConnect={connectWallet} />}</main>

      <footer className="app-footer">
        <span>Contract</span>
        <code>{CONTRACT_ADDRESS || "not configured"}</code>
      </footer>
    </div>
  );
}

async function loadReputation(contract, jobs) {
  const addresses = [
    ...new Set(
      jobs
        .flatMap((job) => [job.client, job.freelancer])
        .filter(Boolean)
        .map((address) => address.toLowerCase())
    )
  ];

  const globalEntries = await Promise.all(
    addresses.map(async (address) => {
      try {
        return [address, Number(await contract.reputation(address))];
      } catch (_error) {
        return [address, 0];
      }
    })
  );

  const skillPairs = [
    ...new Map(
      jobs
        .filter((job) => job.freelancer && job.skill)
        .map((job) => [`${job.freelancer.toLowerCase()}:${job.skill.toLowerCase()}`, [job.freelancer, job.skill]])
    ).values()
  ];
  const skillEntries = await Promise.all(
    skillPairs.map(async ([address, skill]) => {
      const key = `skill:${address.toLowerCase()}:${skill.toLowerCase()}`;
      try {
        return [key, Number(await contract.getSkillReputation(address, skill))];
      } catch (_error) {
        return [key, 0];
      }
    })
  );

  return Object.fromEntries([...globalEntries, ...skillEntries]);
}

function EmptyConnectState({ onConnect }) {
  return (
    <section className="empty-state">
      <ShieldCheck size={42} />
      <h2>Connect a wallet</h2>
      <p>Use a Monad testnet wallet to fund agent work, stake on execution, and settle through AI consensus.</p>
      <button className="primary-button" type="button" onClick={onConnect}>
        <Wallet size={18} />
        Connect Wallet
      </button>
    </section>
  );
}
