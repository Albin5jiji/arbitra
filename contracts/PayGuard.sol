// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PayGuard {
    enum JobStatus {
        Open,
        Accepted,
        Submitted,
        Settled,
        Rejected,
        Escalated,
        Cancelled
    }

    struct Job {
        address client;
        address freelancer;
        string description;
        string requirements;
        string skill;
        uint256 amount;
        uint256 stakeRequired;
        uint256 stakeLocked;
        JobStatus status;
        string submissionUrl;
        bytes32 evidenceHash;
        bytes32 consensusHash;
        uint8 approveVotes;
        uint8 rejectVotes;
        uint8 escalateVotes;
        bool humanReviewed;
    }

    address public owner;
    uint256 public jobCount;

    mapping(uint256 => Job) private jobs;
    mapping(address => int256) public reputation;
    mapping(bytes32 => mapping(address => int256)) public skillReputation;

    int256 private constant WORKER_APPROVAL_REWARD = 10;
    int256 private constant WORKER_REJECTION_PENALTY = -8;
    int256 private constant CLIENT_SETTLEMENT_REWARD = 3;

    bool private entered;

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed freelancer,
        uint256 amount,
        uint256 stakeRequired,
        string skill
    );
    event JobAccepted(uint256 indexed jobId, address indexed freelancer, uint256 stake);
    event EvidenceSubmitted(uint256 indexed jobId, string submissionUrl, bytes32 indexed evidenceHash);
    event ConsensusRecorded(
        uint256 indexed jobId,
        bytes32 indexed consensusHash,
        uint8 approveVotes,
        uint8 rejectVotes,
        uint8 escalateVotes,
        JobStatus status
    );
    event PaymentReleased(uint256 indexed jobId, address indexed freelancer, uint256 payment, uint256 returnedStake);
    event StakeSlashed(uint256 indexed jobId, address indexed freelancer, address indexed client, uint256 amount);
    event ReviewerDecision(uint256 indexed jobId, bool approved);
    event JobCancelled(uint256 indexed jobId);
    event ReputationUpdated(address indexed account, bytes32 indexed skillKey, int256 score, int256 skillScore, int256 delta);

    error EmptyEscrow();
    error EmptyEvidence();
    error IncorrectStake();
    error InvalidAddress();
    error InvalidJob();
    error InvalidStatus();
    error InvalidVotes();
    error NotClient();
    error NotFreelancer();
    error NotOwner();
    error PaymentFailed();
    error ReentrantCall();

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert NotOwner();
        }
        _;
    }

    modifier jobExists(uint256 jobId) {
        if (jobId >= jobCount) {
            revert InvalidJob();
        }
        _;
    }

    modifier nonReentrant() {
        if (entered) {
            revert ReentrantCall();
        }
        entered = true;
        _;
        entered = false;
    }

    constructor() {
        owner = msg.sender;
    }

    function createJob(
        address freelancer,
        string calldata description,
        string calldata requirements,
        string calldata skill,
        uint256 stakeRequired
    ) external payable returns (uint256 jobId) {
        if (freelancer == address(0)) {
            revert InvalidAddress();
        }
        if (msg.value == 0) {
            revert EmptyEscrow();
        }

        jobId = jobCount;
        jobs[jobId] = Job({
            client: msg.sender,
            freelancer: freelancer,
            description: description,
            requirements: requirements,
            skill: skill,
            amount: msg.value,
            stakeRequired: stakeRequired,
            stakeLocked: 0,
            status: JobStatus.Open,
            submissionUrl: "",
            evidenceHash: bytes32(0),
            consensusHash: bytes32(0),
            approveVotes: 0,
            rejectVotes: 0,
            escalateVotes: 0,
            humanReviewed: false
        });
        jobCount += 1;

        emit JobCreated(jobId, msg.sender, freelancer, msg.value, stakeRequired, skill);
    }

    function acceptJob(uint256 jobId) external payable jobExists(jobId) {
        Job storage job = jobs[jobId];
        if (msg.sender != job.freelancer) {
            revert NotFreelancer();
        }
        if (job.status != JobStatus.Open) {
            revert InvalidStatus();
        }
        if (msg.value != job.stakeRequired) {
            revert IncorrectStake();
        }

        job.stakeLocked = msg.value;
        job.status = JobStatus.Accepted;

        emit JobAccepted(jobId, msg.sender, msg.value);
    }

    function submitWork(
        uint256 jobId,
        string calldata submissionUrl,
        bytes32 evidenceHash
    ) external jobExists(jobId) {
        Job storage job = jobs[jobId];
        if (msg.sender != job.freelancer) {
            revert NotFreelancer();
        }
        if (job.status != JobStatus.Accepted) {
            revert InvalidStatus();
        }
        if (evidenceHash == bytes32(0)) {
            revert EmptyEvidence();
        }

        job.submissionUrl = submissionUrl;
        job.evidenceHash = evidenceHash;
        job.status = JobStatus.Submitted;

        emit EvidenceSubmitted(jobId, submissionUrl, evidenceHash);
    }

    function recordConsensus(
        uint256 jobId,
        bytes32 consensusHash,
        uint8 approveVotes,
        uint8 rejectVotes,
        uint8 escalateVotes
    ) external onlyOwner nonReentrant jobExists(jobId) {
        Job storage job = jobs[jobId];
        if (job.status != JobStatus.Submitted) {
            revert InvalidStatus();
        }
        if (
            consensusHash == bytes32(0) ||
            approveVotes + rejectVotes + escalateVotes != 3 ||
            approveVotes > 3 ||
            rejectVotes > 3 ||
            escalateVotes > 3
        ) {
            revert InvalidVotes();
        }

        job.consensusHash = consensusHash;
        job.approveVotes = approveVotes;
        job.rejectVotes = rejectVotes;
        job.escalateVotes = escalateVotes;

        if (approveVotes >= 2) {
            _settleApproved(jobId, job);
        } else if (rejectVotes >= 2) {
            _settleRejected(jobId, job);
        } else {
            job.status = JobStatus.Escalated;
        }

        emit ConsensusRecorded(
            jobId,
            consensusHash,
            approveVotes,
            rejectVotes,
            escalateVotes,
            job.status
        );
    }

    function approveByReviewer(uint256 jobId) external onlyOwner nonReentrant jobExists(jobId) {
        Job storage job = jobs[jobId];
        if (job.status != JobStatus.Escalated) {
            revert InvalidStatus();
        }

        job.humanReviewed = true;
        _settleApproved(jobId, job);
        emit ReviewerDecision(jobId, true);
    }

    function rejectByReviewer(uint256 jobId) external onlyOwner nonReentrant jobExists(jobId) {
        Job storage job = jobs[jobId];
        if (job.status != JobStatus.Escalated) {
            revert InvalidStatus();
        }

        job.humanReviewed = true;
        _settleRejected(jobId, job);
        emit ReviewerDecision(jobId, false);
    }

    function cancelJob(uint256 jobId) external nonReentrant jobExists(jobId) {
        Job storage job = jobs[jobId];
        if (msg.sender != job.client) {
            revert NotClient();
        }
        if (job.status != JobStatus.Open) {
            revert InvalidStatus();
        }

        uint256 refund = job.amount;
        job.status = JobStatus.Cancelled;
        _pay(job.client, refund);

        emit JobCancelled(jobId);
    }

    function getJob(uint256 jobId) external view jobExists(jobId) returns (Job memory) {
        return jobs[jobId];
    }

    function getSkillReputation(address account, string calldata skill) external view returns (int256) {
        return skillReputation[keccak256(bytes(skill))][account];
    }

    function _settleApproved(uint256 jobId, Job storage job) private {
        uint256 payment = job.amount;
        uint256 returnedStake = job.stakeLocked;
        job.stakeLocked = 0;
        job.status = JobStatus.Settled;

        _updateReputation(job.freelancer, job.skill, WORKER_APPROVAL_REWARD);
        reputation[job.client] += CLIENT_SETTLEMENT_REWARD;
        emit ReputationUpdated(job.client, bytes32(0), reputation[job.client], 0, CLIENT_SETTLEMENT_REWARD);

        _pay(job.freelancer, payment + returnedStake);
        emit PaymentReleased(jobId, job.freelancer, payment, returnedStake);
    }

    function _settleRejected(uint256 jobId, Job storage job) private {
        uint256 refundAndSlash = job.amount + job.stakeLocked;
        uint256 slashedStake = job.stakeLocked;
        job.stakeLocked = 0;
        job.status = JobStatus.Rejected;

        _updateReputation(job.freelancer, job.skill, WORKER_REJECTION_PENALTY);
        _pay(job.client, refundAndSlash);

        emit StakeSlashed(jobId, job.freelancer, job.client, slashedStake);
    }

    function _updateReputation(address account, string memory skill, int256 delta) private {
        bytes32 key = keccak256(bytes(skill));
        reputation[account] += delta;
        skillReputation[key][account] += delta;
        emit ReputationUpdated(account, key, reputation[account], skillReputation[key][account], delta);
    }

    function _pay(address recipient, uint256 amount) private {
        if (amount == 0) {
            return;
        }
        (bool success, ) = payable(recipient).call{value: amount}("");
        if (!success) {
            revert PaymentFailed();
        }
    }
}
