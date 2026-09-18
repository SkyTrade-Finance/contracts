# AGENTS.md

Instructions for humans and coding agents in this **SkyTrade Finance (STF)** fork of Polymath Core.

## Read these first

| Doc | What it is |
|-----|------------|
| [`contract-hardhat/README.md`](./contract-hardhat/README.md) | **Canonical STF docs** — fork changes, Quick Start, scripts, networks, addresses |
| [`contract-hardhat/.env.example`](./contract-hardhat/.env.example) | All Hardhat env vars |
| [`README.md`](./README.md) | Original Polymath Core (ST-20 architecture, modules, historical Ethereum/Kovan tables) |
| [`docs/README.md`](./docs/README.md) | Polymath GitBook entry (same Core text) |
| [`docs/wiki/`](./docs/wiki/) | Polymath CLI wiki pages |
| [`docs/api/`](./docs/api/) | Generated Polymath-era Solidity API pages |
| [`docs/misc/`](./docs/misc/) | Investor flags, permissions, TM notes |
| [`docs/VERIFY_TOKEN.md`](./docs/VERIFY_TOKEN.md) / [`contract-hardhat/VERIFY_TOKEN.md`](./contract-hardhat/VERIFY_TOKEN.md) | Token verification notes |
| [`contract-hardhat/scripts/deployed-monad-testnet.txt`](./contract-hardhat/scripts/deployed-monad-testnet.txt) | Live Monad testnet addresses |

Do not treat Polymath mainnet/Kovan tables as STF deployments. Do not rewrite those READMEs; point STF specifics at `contract-hardhat/README.md`.

## Where to work

**All new work is in `contract-hardhat/`** (Solidity `0.8.30`, Hardhat, Node `v20.11.1`). Root Truffle (`truffle-config.js`, `migrations/`, root `test/`, `CLI/`) is legacy — do not extend it unless asked.

STF-only protocol (details in the Hardhat README):

- `TradingRestrictionManager` — Merkle KYC, US vs non-US locks, operators
- Chain-specific Permit2 as `Permit2Contract` (`PERMIT2_ADDRESS` is validated and reused; never deployed here)
- `USDTieredSTO` / `buyWithUSD` + `DummyERC20` on testnets

Sibling apps `stf/` and `stf-backend/` hardcode registry/token addresses. Update them after deploy.

## Tooling

```bash
cd contract-hardhat
cp .env.example .env   # required — Hardhat throws without .env
yarn && yarn compile && yarn test
```

Before deploying, set `PERMIT2_ADDRESS` to an existing Permit2 deployment on the target chain.

- Deploy: `yarn contracts:deploy:monadTestnet` or `:localhost`
- Upgrade: `npx hardhat run scripts/upgrade-contracts.ts --network monadTestnet` after editing `scripts/upgrade-config.ts` **addresses** (RPC/keys stay in `.env`)
- Coverage is heavy; run only if asked

## Safety / footguns

- Never commit `.env`, keys, or mnemonics; never paste secrets from `.env` into docs.
- `PERMIT2_ADDRESS` must identify a contract with code on the target chain or deploy fails; changing networks requires checking and updating it.
- `deploy.ts` always appends to `scripts/deployed-monad-testnet.txt` (even on non-Monad networks).
- `yarn contracts:deploy:baseSepoliaTestnet` is misnamed; Hardhat network is `baseSepolia`.
- `upgrade-config.ts` still has leftover Mantle comments; do not use those RPC/key fields.
- Do not reorder storage in upgradeable `*Storage.sol` contracts. `SecurityToken` must link `TokenLib`.
- Do not change `viaIR` / `bytecodeHash` casually (`USDTieredSTO` compile + Sourcify).
- `docs/api/` is not synced to 0.8.30 and does not document TRM/Permit2.

## After deploy / upgrade

1. `contract-hardhat/scripts/deployed-monad-testnet.txt`
2. `contract-hardhat/subgraph/subgraph.yaml` (`address`, `startBlock`)
3. Hardcoded addresses in `stf/` and `stf-backend/`

When scripts, env, or STF fork behavior change, update **`contract-hardhat/README.md`** and **`.env.example`**. Keep Polymath Core READMEs as-is aside from the STF pointer at the top.
