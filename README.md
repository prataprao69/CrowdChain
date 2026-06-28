# CrowdChain — Decentralized Crowdfunding dApp

## Setup (one time only)

```bash
npm install
```

---

## Running the project — 3 commands total

### Terminal 1 — Start local blockchain (keep this open)
```bash
npm run node
```

### Terminal 2 — Deploy contract (compiles + deploys + writes address automatically)
```bash
npm run deploy
```

### Terminal 2 — Serve the frontend
```bash
npm start
```

Then open **http://localhost:3000** in your browser.

That's it. No manual copy-pasting of addresses. No Python server needed.

---

## Deploying to Sepolia testnet instead

1. Copy `.env.example` to `.env` and fill in:
   ```
   PRIVATE_KEY=your_metamask_private_key
   SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your_key
   ```
2. Run:
   ```bash
   npm run deploy:sepolia
   npm start
   ```

Get free Sepolia ETH at: https://sepoliafaucet.com  
Get a free RPC at: https://alchemy.com

---

## MetaMask setup for localhost

Add a custom network in MetaMask:
- **RPC URL**: http://127.0.0.1:8545
- **Chain ID**: 31337
- **Currency**: ETH

Import a test wallet by copying a private key from the `npm run node` output.

---

## IPFS setup (Pinata)

1. Sign up free at https://app.pinata.cloud
2. Create an API key (V1)
3. Paste into `frontend/app.js`:
   ```js
   const PINATA_API_KEY    = "your_key";
   const PINATA_SECRET_KEY = "your_secret";
   ```

---

## Project structure

```
crowdchain/
├── contracts/Crowdfunding.sol   ← Smart contract
├── scripts/deploy.js            ← Deploy + auto-writes address
├── frontend/
│   ├── index.html               ← UI
│   ├── style.css                ← Styles
│   ├── app.js                   ← All logic
│   └── contract.js              ← ABI + address (auto-updated)
├── server.js                    ← Tiny static server (npm start)
├── hardhat.config.js
└── package.json
```

---

## Smart contract functions

| Function | Who | Description |
|---|---|---|
| `applyForVerification(hash)` | Anyone | Submit IPFS proof hash |
| `voteOnCreator(addr, bool)` | Anyone | Upvote or downvote a creator |
| `createCampaign(...)` | Verified creators | Create a campaign |
| `contribute(id)` | Anyone | Send ETH to a campaign |
| `withdrawFunds(id)` | Creator | Withdraw if goal met after deadline |
| `refund(id)` | Contributors | Refund if goal not met after deadline |