# ShadowLuck

ShadowLuck is a privacy-first, on-chain mini-lottery built on Zama's FHEVM. Players pick two numbers (1-9), encrypt
their picks in the browser, and submit a 0.001 ETH ticket. The contract draws two encrypted random numbers and mints
confidential WETH rewards based on matches, while keeping all picks, draws, and scores encrypted on-chain.

## What this project solves

Traditional on-chain lotteries expose user picks and outcomes, enabling front-running and eroding privacy. ShadowLuck
uses fully homomorphic encryption to:

- Hide player picks and draw results from the public chain while still letting the contract compute rewards.
- Preserve fairness with deterministic, on-chain settlement logic.
- Keep reward balances confidential, only decryptable by the player via the relayer flow.

## Key advantages

- End-to-end confidentiality: picks, draws, and score never appear in plaintext on-chain.
- Fully on-chain logic: reward computation and minting happen inside the contract, not in off-chain scripts.
- User-controlled decryption: the player signs an EIP-712 request for the relayer to return decrypted values.
- Minimal state leakage: no local storage, no off-chain caches, no mock data in the UI.
- Simple and transparent economics: fixed ticket price, fixed rewards, and deterministic settlement.

## Game rules at a glance

1. Buy a ticket for 0.001 ETH.
2. Pick two numbers from 1 to 9 (encrypted in the browser).
3. Start the draw to generate two encrypted random numbers.
4. Reward logic:
   - Match one number: 0.001 WETH (confidential).
   - Match both numbers: 0.01 WETH (confidential).
5. Decrypt your score and draw results via the relayer flow.

## Technology stack

- Smart contracts: Solidity 0.8.27, Hardhat, hardhat-deploy, TypeChain
- FHE layer: Zama FHEVM Solidity library and relayer flow
- Confidential token: OpenZeppelin ERC7984
- Frontend: React + Vite + TypeScript
- Wallet UX: RainbowKit + wagmi
- On-chain reads: viem
- On-chain writes: ethers
- Styling: custom CSS (no Tailwind)
- Package manager: npm

## Architecture overview

ShadowLuck is split into two contracts and a front-end UI:

1. ShadowLuck (lottery contract)
   - Stores encrypted picks (euint8) and encrypted score (euint64).
   - Uses FHE.randEuint8 for encrypted draws and FHE math to compute rewards.
   - Emits TicketPurchased and RoundPlayed events.
2. ShadowLuckWETH (confidential reward token)
   - ERC7984 token that mints confidential balances to winners.
   - The lottery contract is the sole minter.
3. Frontend (home/)
   - Encrypts picks locally using the Zama SDK.
   - Sends transactions using ethers and reads state with viem.
   - Requests decryption from the relayer with an EIP-712 signature.

## Smart contract details

### ShadowLuck

- Ticket price: 0.001 ETH (TICKET_PRICE).
- Player state includes encrypted picks, encrypted last draw results, encrypted score, encrypted last reward, round count,
  and whether a ticket is active.
- View methods accept an explicit address parameter; they do not rely on msg.sender.
- Rewards are added to an encrypted score and minted as confidential WETH.

Main functions:

- buyTicket(externalEuint8 firstPick, externalEuint8 secondPick, bytes inputProof)
  - Requires exactly 0.001 ETH.
  - Stores encrypted picks and authorizes the caller to read them.
- playRound()
  - Requires an active ticket.
  - Generates two encrypted random numbers in the range 1-9.
  - Computes reward using FHE comparisons and selection.
  - Mints confidential WETH to the player.
- getEncryptedScore(address player)
  - Returns encrypted score.
- getTicket(address player)
  - Returns encrypted picks and active flag.
- getLastResult(address player)
  - Returns encrypted draw values, encrypted reward, round count, and active flag.
- ticketPrice()
  - Returns the fixed ticket price.
- getRewardToken()
  - Returns the reward token address.

### ShadowLuckWETH

- Confidential ERC7984 token.
- Only the configured minter (the lottery contract) can mint.
- Standard 18 decimals.

## Repository layout

- `contracts/`: ShadowLuck.sol, wrapETH.sol, plus template contract(s).
- `deploy/`: Deployment scripts (deploys both contracts and sets minter).
- `tasks/`: Hardhat tasks for operational flows.
- `test/`: Unit tests (FHEVM mock only).
- `home/`: React + Vite frontend.
- `deployments/sepolia/`: Deployment artifacts and generated ABI JSON files.
- `docs/`: Zama FHEVM and relayer references.

## Setup and usage

### Prerequisites

- Node.js 20+
- npm
- A funded account for Sepolia deployment

### Install dependencies

```bash
npm install
```

### Environment configuration (Hardhat only)

Create a `.env` file for Hardhat:

- `INFURA_API_KEY`
- `PRIVATE_KEY`
- `ETHERSCAN_API_KEY` (optional, for verification)
- `REPORT_GAS` (optional, set to enable gas report)

The Hardhat config loads `dotenv` and does not use a mnemonic.

### Compile

```bash
npm run compile
```

### Tests

```bash
npm run test
```

Notes:
- The test suite runs only on the FHEVM mock backend and will skip on unsupported networks.

### Local deployment (development node)

1. Start a local FHEVM-capable node.
2. Deploy contracts:

```bash
npx hardhat deploy --network anvil
```

If you prefer the in-memory Hardhat network:

```bash
npx hardhat deploy
```

### Sepolia deployment

1. Ensure `.env` contains `PRIVATE_KEY` and `INFURA_API_KEY`.
2. Deploy to Sepolia:

```bash
npx hardhat deploy --network sepolia
```

3. Optional contract verification:

```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

## Hardhat tasks

- Print deployed addresses:
  - `npx hardhat task:shadowluck-address --network <network>`
- Buy a ticket:
  - `npx hardhat task:buy-ticket --first 3 --second 7 --network <network>`
- Play a round:
  - `npx hardhat task:play-round --network <network>`
- Decrypt score for a player:
  - `npx hardhat task:decrypt-score --player <address> --network <network>`

## Frontend setup

The frontend lives in `home/` and uses static configuration (no environment variables).

1. Copy ABIs from the deployment artifacts into the frontend:
   - `deployments/sepolia/ShadowLuck.json`
   - `deployments/sepolia/ShadowLuckWETH.json`
   - Paste the ABI arrays into `home/src/config/contracts.ts`
2. Update contract addresses in:
   - `home/src/config/contracts.ts`

Run the app:

```bash
cd home
npm install
npm run dev
```

Build the app:

```bash
npm run build
```

Frontend behavior:

- Reads use viem via wagmi hooks.
- Writes use ethers with a signer.
- Encryption happens client-side before submitting a ticket.
- Decryption is performed through the Zama relayer flow using a signed EIP-712 request.
- No local storage is used; all state is derived from on-chain data.

## Operational notes and limitations

- Randomness comes from FHE.randEuint8 and is not a VRF oracle.
- Rewards are minted as confidential ERC7984 balances, not standard ERC20 balances.
- Decryption requires the relayer and a valid user signature; without it, values remain ciphertexts.
- Ticket price is fixed at 0.001 ETH for the current game model.

## Future roadmap

Planned expansions and improvements:

- Multi-round history with encrypted per-round metadata.
- Optional multi-ticket support in a single session.
- Configurable reward tiers or jackpot pools.
- Alternate randomness sources or hybrid randomness validation.
- UI enhancements for session history and decrypted analytics.
- Broader test coverage (edge cases, failure modes, and gas profiling).
- Security review and audit readiness checklist.

## References

- Zama FHEVM contract notes: `docs/zama_llm.md`
- Zama relayer flow: `docs/zama_doc_relayer.md`

## License

BSD-3-Clause-Clear. See `LICENSE`.
