// scripts/deploy.js
// Compiles, deploys, and automatically writes the contract address
// into frontend/contract.js — no manual copy-paste needed.

const hre  = require("hardhat");
const fs   = require("fs");
const path = require("path");

async function main() {
  console.log("\n🔨 Compiling contracts...");
  await hre.run("compile");

  console.log("\n🚀 Deploying CrowdChain...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer :", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance  :", hre.ethers.formatEther(balance), "ETH\n");

  const Crowdfunding = await hre.ethers.getContractFactory("Crowdfunding");
  const crowdfunding = await Crowdfunding.deploy();
  await crowdfunding.waitForDeployment();

  const address = await crowdfunding.getAddress();
  console.log("✅ Deployed to:", address);

  // ── Auto-write address into frontend/contract.js ──────────────────────────
  const contractJsPath = path.join(__dirname, "../frontend/contract.js");
  let content = fs.readFileSync(contractJsPath, "utf8");

  // Replace whatever is currently in CONTRACT_ADDRESS = "..."
  content = content.replace(
    /const CONTRACT_ADDRESS\s*=\s*".*?"/,
    `const CONTRACT_ADDRESS = "${address}"`
  );

  fs.writeFileSync(contractJsPath, content, "utf8");
  console.log("📝 Address written to frontend/contract.js automatically.\n");
  console.log("👉 Run  npm start  to open the app.\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});