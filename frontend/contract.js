// frontend/contract.js
// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: After deploying the contract, paste your contract address here.
// ─────────────────────────────────────────────────────────────────────────────
const CONTRACT_ADDRESS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

// ─────────────────────────────────────────────────────────────────────────────
// ABI — copied from artifacts/contracts/Crowdfunding.sol/Crowdfunding.json
// after running: npx hardhat compile
// ─────────────────────────────────────────────────────────────────────────────
const CONTRACT_ABI = [
  // ── Events ──
  "event ApplicationSubmitted(address indexed creator, string ipfsHash)",
  "event Voted(address indexed voter, address indexed creator, bool upvote)",
  "event CreatorVerified(address indexed creator)",
  "event CampaignCreated(uint indexed campaignId, address indexed creator, string title)",
  "event CampaignEdited(uint indexed campaignId, string newTitle, string newDescription)",
  "event Contributed(uint indexed campaignId, address indexed contributor, uint amount)",
  "event FundsWithdrawn(uint indexed campaignId, address indexed creator, uint amount)",
  "event Refunded(uint indexed campaignId, address indexed contributor, uint amount)",

  // ── Read ──
  "function VOTE_THRESHOLD() view returns (uint)",
  "function campaignCount() view returns (uint)",
  "function getCampaignCount() view returns (uint)",
  "function getCampaignDetails(uint campaignId) view returns (uint id, address creator, string title, string description, uint goal, uint deadline, uint amountRaised, bool withdrawn)",
  "function getCreatorProof(address creator) view returns (string ipfsHash, bool verified, bool applied)",
  "function getVotes(address creator) view returns (uint upvotes, uint downvotes)",
  "function hasVoted(address voter, address creator) view returns (bool)",
  "function getContribution(uint campaignId, address contributor) view returns (uint)",

  // ── Write ──
  "function applyForVerification(string ipfsDocHash)",
  "function voteOnCreator(address creator, bool upvote)",
  "function createCampaign(string title, string description, uint goal, uint deadline) returns (uint)",
  "function editCampaign(uint campaignId, string title, string description)",
  "function contribute(uint campaignId) payable",
  "function withdrawFunds(uint campaignId)",
  "function refund(uint campaignId)"
];