// frontend/app.js
// ─────────────────────────────────────────────────────────────────────────────
// CrowdChain — Main Application Logic
// Handles wallet, IPFS upload, contract interaction, and UI updates.
// ─────────────────────────────────────────────────────────────────────────────

// ── Globals ──────────────────────────────────────────────────────────────────
let provider   = null;   // ethers.BrowserProvider
let signer     = null;   // connected wallet signer
let contract   = null;   // contract instance (read+write)
let userAddress = null;  // currently connected wallet address

// Pinata IPFS credentials
// Replace with your own from https://app.pinata.cloud
const PINATA_API_KEY    = "ce3c031c48e62d3fe709";
const PINATA_SECRET_KEY = "b62f5c244645da3e909133d3e708903a70ced3d287c257af4013a2d3acb0af93";

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 1 — WALLET CONNECTION
// ─────────────────────────────────────────────────────────────────────────────

async function connectWallet() {
  if (!window.ethereum) {
    showStatus("MetaMask not found. Please install it.", "error");
    return;
  }

  try {
    showStatus("Connecting wallet…", "info");

    // Request account access
    await window.ethereum.request({ method: "eth_requestAccounts" });

    provider    = new ethers.BrowserProvider(window.ethereum);
    signer      = await provider.getSigner();
    userAddress = await signer.getAddress();

    // Create contract instance with signer (enables write)
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    // Update UI
    document.getElementById("wallet-address").textContent =
      userAddress.slice(0, 6) + "…" + userAddress.slice(-4);
    document.getElementById("connect-btn").textContent = "Connected";
    document.getElementById("connect-btn").classList.add("connected");

    const network = await provider.getNetwork();
    document.getElementById("network-name").textContent = network.name;

    showStatus("Wallet connected: " + userAddress, "success");

    // Load all data once connected
    await loadCreatorStatus();
    await loadAllCampaigns();

    // Listen for account/chain changes
    window.ethereum.on("accountsChanged", () => window.location.reload());
    window.ethereum.on("chainChanged",    () => window.location.reload());

  } catch (err) {
    showStatus("Connection failed: " + err.message, "error");
  }
}


// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 2 — IPFS UPLOAD (via Pinata)
// ─────────────────────────────────────────────────────────────────────────────

async function uploadToIPFS(file) {
  showStatus("Uploading document to IPFS…", "info");

  const formData = new FormData();
  formData.append("file", file);

  const metadata = JSON.stringify({ name: file.name });
  formData.append("pinataMetadata", metadata);

  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {
      pinata_api_key:        PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_KEY,
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error("IPFS upload failed: " + err);
  }

  const result = await response.json();
  return result.IpfsHash; // This is the CID (e.g. "QmXyz...")
}


// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 3 — CREATOR VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

async function applyForVerification() {
  requireWallet();
  const fileInput = document.getElementById("proof-file");
  const file      = fileInput.files[0];

  if (!file) { showStatus("Please select a PDF file.", "error"); return; }
  if (file.type !== "application/pdf") { showStatus("Only PDF files accepted.", "error"); return; }

  try {
    // 1. Upload PDF to IPFS
    const ipfsHash = await uploadToIPFS(file);
    showStatus("IPFS upload success. Hash: " + ipfsHash, "info");

    // 2. Send hash to smart contract
    showStatus("Submitting verification to blockchain…", "info");
    const tx = await contract.applyForVerification(ipfsHash);
    showStatus("Transaction submitted. Waiting for confirmation…", "info");
    await tx.wait();

    showStatus("✅ Verification application submitted!", "success");
    await loadCreatorStatus();

  } catch (err) {
    showStatus("Error: " + (err.reason || err.message), "error");
  }
}

async function loadCreatorStatus() {
  if (!contract || !userAddress) return;

  try {
    const [ipfsHash, verified, applied] = await contract.getCreatorProof(userAddress);
    const [upvotes, downvotes]          = await contract.getVotes(userAddress);

    const statusBox  = document.getElementById("creator-status");
    const createSection = document.getElementById("create-campaign-section");

    if (!applied) {
      statusBox.innerHTML = `<span class="badge badge-gray">Not Applied</span>`;
      createSection.style.display = "none";
      return;
    }

    if (verified) {
      statusBox.innerHTML = `<span class="badge badge-green">✔ Verified by Community</span>`;
      createSection.style.display = "block";
    } else {
      statusBox.innerHTML = `
        <span class="badge badge-yellow">Pending — ${upvotes} upvotes / ${downvotes} downvotes</span>
        <p class="text-sm mt-1">Need ${await contract.VOTE_THRESHOLD()} upvotes to pass.</p>
      `;
      createSection.style.display = "none";
    }

    // Show proof link
    if (ipfsHash) {
      document.getElementById("my-proof-link").href =
        "https://ipfs.io/ipfs/" + ipfsHash;
      document.getElementById("my-proof-link").style.display = "inline";
    }

  } catch (err) {
    console.error("loadCreatorStatus:", err);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 4 — VOTING UI
// ─────────────────────────────────────────────────────────────────────────────

async function lookupCreator() {
  requireWallet();
  const addr = document.getElementById("vote-creator-address").value.trim();
  if (!ethers.isAddress(addr)) { showStatus("Invalid address.", "error"); return; }

  try {
    const [ipfsHash, verified, applied] = await contract.getCreatorProof(addr);
    const [upvotes, downvotes]          = await contract.getVotes(addr);
    const alreadyVoted                  = await contract.hasVoted(userAddress, addr);

    const panel = document.getElementById("vote-panel");

    if (!applied) {
      panel.innerHTML = `<p class="text-muted">This address has not applied for verification.</p>`;
      return;
    }

    const statusBadge = verified
      ? `<span class="badge badge-green">Verified</span>`
      : `<span class="badge badge-yellow">Pending</span>`;

    panel.innerHTML = `
      <div class="vote-info">
        ${statusBadge}
        <p>👍 Upvotes: <strong>${upvotes}</strong> &nbsp; 👎 Downvotes: <strong>${downvotes}</strong></p>
        ${ipfsHash
          ? `<a href="https://ipfs.io/ipfs/${ipfsHash}" target="_blank" class="btn btn-outline">📄 View Proof PDF</a>`
          : ""}
        ${!verified && !alreadyVoted
          ? `<div class="vote-buttons">
               <button class="btn btn-success" onclick="castVote('${addr}', true)">👍 Upvote</button>
               <button class="btn btn-danger"  onclick="castVote('${addr}', false)">👎 Downvote</button>
             </div>`
          : alreadyVoted
            ? `<p class="text-muted">You have already voted on this creator.</p>`
            : ""
        }
      </div>
    `;

  } catch (err) {
    showStatus("Lookup error: " + err.message, "error");
  }
}

async function castVote(creatorAddress, upvote) {
  requireWallet();
  try {
    showStatus("Submitting vote…", "info");
    const tx = await contract.voteOnCreator(creatorAddress, upvote);
    await tx.wait();
    showStatus("✅ Vote recorded!", "success");
    await lookupCreator();
  } catch (err) {
    showStatus("Vote failed: " + (err.reason || err.message), "error");
  }
}


// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 5 — CAMPAIGN CREATION
// ─────────────────────────────────────────────────────────────────────────────

async function createCampaign() {
  requireWallet();

  const title       = document.getElementById("c-title").value.trim();
  const description = document.getElementById("c-description").value.trim();
  const goalEth     = document.getElementById("c-goal").value;
  const deadlineStr = document.getElementById("c-deadline").value;

  if (!title || !description || !goalEth || !deadlineStr) {
    showStatus("All fields are required.", "error");
    return;
  }

  const goalWei    = ethers.parseEther(goalEth);
  const deadline   = Math.floor(new Date(deadlineStr).getTime() / 1000);

  if (deadline <= Math.floor(Date.now() / 1000)) {
    showStatus("Deadline must be in the future.", "error");
    return;
  }

  try {
    showStatus("Creating campaign…", "info");
    const tx = await contract.createCampaign(title, description, goalWei, deadline);
    await tx.wait();
    showStatus("✅ Campaign created!", "success");

    // Reset form
    ["c-title", "c-description", "c-goal", "c-deadline"].forEach(id => {
      document.getElementById(id).value = "";
    });

    await loadAllCampaigns();

  } catch (err) {
    showStatus("Create failed: " + (err.reason || err.message), "error");
  }
}


// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 5b — EDIT CAMPAIGN
// ─────────────────────────────────────────────────────────────────────────────

async function saveEditCampaign(campaignId) {
  requireWallet();

  const title       = document.getElementById(`edit-title-${campaignId}`).value.trim();
  const description = document.getElementById(`edit-desc-${campaignId}`).value.trim();

  if (!title) { showStatus("Title cannot be empty.", "error"); return; }

  try {
    showStatus("Saving changes...", "info");
    const tx = await contract.editCampaign(campaignId, title, description);
    await tx.wait();
    showStatus("✅ Campaign updated!", "success");
    await loadAllCampaigns(); // refresh the grid
  } catch (err) {
    showStatus("Edit failed: " + (err.reason || err.message), "error");
  }
}

function toggleEditForm(campaignId) {
  const form = document.getElementById(`edit-form-${campaignId}`);
  form.style.display = form.style.display === "none" ? "block" : "none";
}


// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

async function loadAllCampaigns() {
  if (!contract) return;

  try {
    const count = Number(await contract.getCampaignCount());
    const grid  = document.getElementById("campaigns-grid");

    if (count === 0) {
      grid.innerHTML = `<p class="text-muted">No campaigns yet.</p>`;
      return;
    }

    grid.innerHTML = ""; // clear

    for (let i = 0; i < count; i++) {
      const c = await contract.getCampaignDetails(i);
      const card = await buildCampaignCard(c, i);
      grid.appendChild(card);
    }

  } catch (err) {
    console.error("loadAllCampaigns:", err);
  }
}

async function buildCampaignCard(c, id) {
  // c is an array: [id, creator, title, description, goal, deadline, amountRaised, withdrawn]
  const now        = Math.floor(Date.now() / 1000);
  const deadline   = Number(c[5]);
  const goal       = c[4];
  const raised     = c[6];
  const isCreator  = userAddress && c[1].toLowerCase() === userAddress.toLowerCase();
  const isExpired  = now >= deadline;
  const goalMet    = raised >= goal;
  const withdrawn  = c[7];

  const progressPct = goal > 0n
    ? Math.min(100, Math.round(Number((raised * 100n) / goal)))
    : 0;

  // Countdown
  const timeLeft = isExpired
    ? "Ended"
    : formatCountdown(deadline - now);

  // Creator verification badge
  let badge = "";
  try {
    const [, verified] = await contract.getCreatorProof(c[1]);
    badge = verified
      ? `<span class="badge badge-green badge-sm">✔ Verified</span>`
      : `<span class="badge badge-gray badge-sm">Unverified</span>`;
  } catch {}

  // Contributor's refund amount
  let myContrib = 0n;
  if (userAddress) {
    try {
      myContrib = await contract.getContribution(id, userAddress);
    } catch {}
  }

  const card = document.createElement("div");
  card.className = "campaign-card";
  card.innerHTML = `
    <div class="campaign-header">
      <h3 class="campaign-title">${escHtml(c[2])}</h3>
      ${badge}
    </div>
    <p class="campaign-desc">${escHtml(c[3])}</p>
    <div class="campaign-meta">
      <span>🎯 Goal: <strong>${ethers.formatEther(goal)} ETH</strong></span>
      <span>💰 Raised: <strong>${ethers.formatEther(raised)} ETH</strong></span>
    </div>
    <div class="progress-bar-wrap">
      <div class="progress-bar" style="width:${progressPct}%"></div>
    </div>
    <div class="campaign-meta">
      <span>${progressPct}% funded</span>
      <span>⏱ ${timeLeft}</span>
    </div>
    <p class="creator-addr">Creator: ${c[1].slice(0,6)}…${c[1].slice(-4)}</p>

    <!-- Edit form (creator only, not withdrawn) -->
    ${isCreator && !withdrawn ? `
      <button class="btn btn-outline btn-sm mt-8" onclick="toggleEditForm(${id})" style="width:100%;">
        ✏️ Edit Campaign
      </button>
      <div id="edit-form-${id}" style="display:none; margin-top:12px; padding-top:12px; border-top:1px solid var(--border);">
        <div class="form-group">
          <label>Title</label>
          <input type="text" id="edit-title-${id}" value="${escHtml(c[2])}" />
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="edit-desc-${id}">${escHtml(c[3])}</textarea>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary btn-sm" onclick="saveEditCampaign(${id})" style="flex:1;">
            Save Changes
          </button>
          <button class="btn btn-outline btn-sm" onclick="toggleEditForm(${id})">
            Cancel
          </button>
        </div>
      </div>` : ""
    }

    <!-- Contribute -->
    ${!isExpired ? `
      <div class="contribute-row">
        <input id="contrib-${id}" type="number" step="0.001" min="0.001"
               placeholder="ETH amount" class="input-sm" />
        <button class="btn btn-primary btn-sm" onclick="contribute(${id})">
          Contribute
        </button>
      </div>` : ""
    }

    <!-- Withdraw (creator only, goal met, expired, not withdrawn) -->
    ${isCreator && isExpired && goalMet && !withdrawn
      ? `<button class="btn btn-success mt-8" onclick="withdrawFunds(${id})">
           💸 Withdraw Funds
         </button>` : ""
    }

    <!-- Refund (contributor, goal not met, expired) -->
    ${!isCreator && isExpired && !goalMet && myContrib > 0n
      ? `<button class="btn btn-warning mt-8" onclick="refund(${id})">
           ↩ Claim Refund (${ethers.formatEther(myContrib)} ETH)
         </button>` : ""
    }

    <!-- Failed badge -->
    ${isExpired && !goalMet
      ? `<span class="badge badge-red badge-sm">❌ Goal Not Reached</span>` : ""}
    ${isExpired && goalMet && withdrawn
      ? `<span class="badge badge-green badge-sm">✅ Funds Withdrawn</span>` : ""}
  `;

  return card;
}


// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 7 — CONTRIBUTE
// ─────────────────────────────────────────────────────────────────────────────

async function contribute(campaignId) {
  requireWallet();
  const input = document.getElementById("contrib-" + campaignId);
  const eth   = input.value;

  if (!eth || parseFloat(eth) <= 0) {
    showStatus("Enter a valid ETH amount.", "error");
    return;
  }

  try {
    showStatus("Sending contribution…", "info");
    const tx = await contract.contribute(campaignId, {
      value: ethers.parseEther(eth),
    });
    await tx.wait();
    showStatus("✅ Contribution sent!", "success");
    await loadAllCampaigns();

  } catch (err) {
    showStatus("Contribute failed: " + (err.reason || err.message), "error");
  }
}


// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 8 — WITHDRAW
// ─────────────────────────────────────────────────────────────────────────────

async function withdrawFunds(campaignId) {
  requireWallet();
  try {
    showStatus("Withdrawing funds…", "info");
    const tx = await contract.withdrawFunds(campaignId);
    await tx.wait();
    showStatus("✅ Funds withdrawn to your wallet!", "success");
    await loadAllCampaigns();
  } catch (err) {
    showStatus("Withdraw failed: " + (err.reason || err.message), "error");
  }
}


// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 9 — REFUND
// ─────────────────────────────────────────────────────────────────────────────

async function refund(campaignId) {
  requireWallet();
  try {
    showStatus("Processing refund…", "info");
    const tx = await contract.refund(campaignId);
    await tx.wait();
    showStatus("✅ Refund received!", "success");
    await loadAllCampaigns();
  } catch (err) {
    showStatus("Refund failed: " + (err.reason || err.message), "error");
  }
}


// ─────────────────────────────────────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function requireWallet() {
  if (!contract || !signer) {
    showStatus("Please connect your wallet first.", "error");
    throw new Error("Wallet not connected");
  }
}

function showStatus(message, type = "info") {
  const box = document.getElementById("status-box");
  box.textContent = message;
  box.className   = "status-box " + type;
  box.style.display = "block";

  // Auto-hide success messages after 5s
  if (type === "success") {
    setTimeout(() => { box.style.display = "none"; }, 5000);
  }
}

function formatCountdown(seconds) {
  if (seconds <= 0) return "Ended";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Tab switching
function showTab(tabId) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
  event.currentTarget.classList.add("active");
}

// ─────────────────────────────────────────────────────────────────────────────
//  INIT — Page load
// ─────────────────────────────────────────────────────────────────────────────

window.addEventListener("DOMContentLoaded", () => {
  // If MetaMask is already connected from a previous session, auto-reconnect
  if (window.ethereum) {
    window.ethereum.request({ method: "eth_accounts" }).then(accounts => {
      if (accounts.length > 0) connectWallet();
    });
  }

  // Set minimum deadline date to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const input = document.getElementById("c-deadline");
  if (input) input.min = tomorrow.toISOString().split("T")[0];
});