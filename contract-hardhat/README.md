# SkyTrade Finance contracts

This directory is the active Solidity workspace for the SkyTrade Finance (STF) fork of [Polymath Core](../README.md). New contract development, tests, deployments, and upgrades belong here.

The root Truffle project, `CLI/`, and `docs/` tree are retained as historical Polymath references. Their setup commands and network tables are not STF deployment instructions.

## What STF adds

| Change | Purpose |
|--------|---------|
| `TradingRestrictionManager` | Stores a global Merkle KYC root, manages operators, and calculates token-specific US/non-US trading locks and optional whitelist-only restrictions. |
| Permit2 integration | Uses an existing Permit2 deployment selected by `PERMIT2_ADDRESS` and registers it as `Permit2Contract` in `PolymathRegistry`. This repository does not deploy production Permit2. |
| `USDTieredSTO.buyWithUSD` | Verifies the investor through `TradingRestrictionManager` and transfers the configured USD token through Permit2. |
| Hardhat port | Builds the trimmed Polymath contract set with Solidity 0.8.30 and 0.8.17. |
| Monad subgraph | Indexes restriction-manager, factory, security-token, STO, and dividend events. |

The primary STF deployment is Monad testnet (`chainId` 10143).

## Prerequisites

- Node.js `v20.11.1` (see [`.nvmrc`](./.nvmrc))
- Yarn Classic; this project uses a Yarn v1 lockfile
- Docker only when running the local Graph Node stack

## Install, compile, and test

Hardhat loads `.env` during configuration and fails if the file is missing. Compilation and unit tests only need the file to exist; they do not need a funded account or real private key.

```bash
nvm use
cp .env.example .env
yarn
yarn compile
yarn test
```

PowerShell equivalent for the copy step:

```powershell
Copy-Item .env.example .env
```

Coverage is resource intensive and disables most optimizer and `viaIR` settings:

```bash
yarn coverage
```

## How the STF restriction flow works

1. The `TradingRestrictionManager` owner grants trusted KYC operators.
2. An operator publishes a Merkle root directly or signs a root-and-expiry update.
3. An investor supplies a proof containing their address, KYC expiry, accreditation status, and US/non-US class.
4. `TradingRestrictionManager` stores the verified investor state and exposes transfer times to `GeneralTransferManager`.
5. A token owner can configure US and non-US restriction periods and enable whitelist-only trading for that token.
6. `USDTieredSTO.buyWithUSD` verifies the investor and uses the Permit2 address registered in `PolymathRegistry` to move the payment token.

The Merkle root and investor proof must both be unexpired. Contract ownership and the operator role are separate: the owner manages operators and token restrictions; operators manage KYC roots.

## Deployment configuration

Copy `.env.example` to `.env`, then configure it for the exact chain selected with Hardhat's `--network` option.

The deploy script requires:

- `CHAIN_ID`: the intended target chain ID. Confirm it matches the selected Hardhat network.
- `PROVIDER_URL`: an RPC endpoint for that same chain.
- `OWNER_ADDRESS`: the deployer address.
- `OWNER_PRIVATE_KEY`: the matching private key for configured remote networks.
- `PERMIT2_ADDRESS`: an existing Permit2 contract on that same chain.

### Permit2 is chain-specific

Before deploying STF, check whether Permit2 exists on the target chain. If it does, put that chain's Permit2 address in `PERMIT2_ADDRESS`.

`deploy.ts` will:

1. Validate that `PERMIT2_ADDRESS` is an address.
2. Check for contract bytecode at that address on the connected chain.
3. Skip Permit2 deployment.
4. Register the supplied address as `Permit2Contract` after `PolymathRegistry` is available.

Deployment stops before the STF contracts are deployed if the variable is missing, invalid, or points to an address without code. Do not reuse an address from another chain without checking it on the target chain.

The canonical Uniswap Permit2 address used on Monad testnet is:

```dotenv
PERMIT2_ADDRESS=0x000000000022D473030F116dDEE9F6B43aC78BA3
```

## Local deployment

A clean local chain does not contain Permit2. Deploy the included `MockPermit2` first, then put its address in `.env`. The mock is for local development only.

Start a local Hardhat node:

```bash
yarn start:local
```

In another terminal, configure `.env` for the local chain:

```dotenv
CHAIN_ID=1337
PROVIDER_URL=http://127.0.0.1:8545
OWNER_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
OWNER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Deploy the mock from a Hardhat console connected to that node:

```bash
npx hardhat console --network localhost
```

```javascript
const permit2 = await ethers.deployContract("MockPermit2");
await permit2.waitForDeployment();
await permit2.getAddress();
```

Set the returned address as `PERMIT2_ADDRESS`, exit the console, and deploy STF:

```bash
yarn contracts:deploy:localhost
```

`localhost` and the in-process `hardhat` network use chain ID `1337`. The separately configured `local` network uses chain ID `31337` and `PROVIDER_URL`.

## Monad testnet deployment

Set the Monad RPC, funded deployer, chain ID, and Monad Permit2 address in `.env`:

```dotenv
CHAIN_ID=10143
PROVIDER_URL=https://testnet-rpc.monad.xyz
OWNER_ADDRESS=0xYourDeployerAddress
OWNER_PRIVATE_KEY=0xYourPrivateKey
PERMIT2_ADDRESS=0x000000000022D473030F116dDEE9F6B43aC78BA3
```

Never commit `.env` or a real private key.

```bash
yarn contracts:deploy:monadTestnet
```

The deploy script reuses the configured Permit2 contract. It also reuses the hardcoded Monad `PolymathRegistry` address when code already exists there; otherwise it deploys a new registry.

### Current Monad testnet deployment

Last successful recorded deployment: 2026-09-16. Subgraph start block: `63040980`. The complete deployment manifest is [`scripts/deployed-monad-testnet.txt`](./scripts/deployed-monad-testnet.txt).

| Contract | Address |
|----------|---------|
| PolymathRegistry | `0x38f0FEEDD4Cd1985A13b5102A8d805BcA3966420` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| TradingRestrictionManager | `0xE1b5ab6E27133d24bBa010D59c8B6Cb2BAA80195` |
| ModuleRegistryProxy | `0xb90Dc58d4524270Db06e39548376928b81182AC5` |
| SecurityTokenRegistryProxy | `0x24D35199248b3323Dd9FFdD27Aab0A3Bcd48483E` |
| GeneralTransferManagerFactory | `0x25CfceA12a742488DCcBeBcb2E80C424F3c9a19B` |
| USDTieredSTOFactory | `0xF41DC8e89122E40087cAf67387dE34ff2551796d` |
| ERC20DividendCheckpointFactory | `0x2A2370CeF46F38dde68fC25c1d07f001e633d633` |
| DummyERC20 | `0x6a9673bE1fc232AfEA2055C5bC0AbD175B141633` |

Use the final `status=success` block in the manifest. It retains an earlier failed attempt for history.

## Commands and network status

| Command | Status and purpose |
|---------|--------------------|
| `yarn compile` | Compile contracts and generate artifacts. |
| `yarn test` | Generate TypeChain bindings and run the Hardhat tests. |
| `yarn coverage` | Run Solidity coverage with an 8 GB Node heap. |
| `yarn start:local` | Start a local Hardhat node on port 8545. |
| `yarn contracts:deploy:localhost` | Deploy to `localhost` after configuring a local Permit2-compatible contract. |
| `yarn contracts:deploy:local` | Deploy through `PROVIDER_URL` to the configured chain-31337 network. |
| `yarn contracts:deploy:monadTestnet` | Active Monad testnet deployment path. |
| `yarn contracts:deploy:polygonMainnet` | Configured but not documented here as a verified production deployment. |
| `yarn contracts:deploy:bnbMainnet` | Configured but not documented here as a verified production deployment. |
| `yarn contracts:deploy:mantleMainnet` | Configured but not documented here as a verified production deployment. |
| `yarn start` / `yarn stop` | Start or stop the Docker Compose Graph Node, IPFS, Postgres, and Ganache stack. |
| `yarn graph:all:local` | Generate, build, create, and deploy the subgraph to the local Graph Node. |

Known script limitations:

- `contracts:deploy:baseSepoliaTestnet` refers to a nonexistent `baseSepoliaTestnet` Hardhat network. The configured network is `baseSepolia`; use `npx hardhat run scripts/deploy.ts --network baseSepolia` until the package alias is fixed.
- `contracts:deploy:hardhat` cannot reuse a Permit2 contract created in a previous command because the in-process network is recreated for every command.
- The two `contracts:verify:*` package aliases reference scripts that are not present. Monad verification is currently handled through Sourcify; see [VERIFY_TOKEN.md](./VERIFY_TOKEN.md).
- `deploy.ts` always appends to `scripts/deployed-monad-testnet.txt`, including deployments to other networks. Check the recorded chain ID before treating an entry as a Monad deployment.

## Environment variables

See [`.env.example`](./.env.example) for the complete template.

| Variable | Needed for | Purpose |
|----------|------------|---------|
| `CHAIN_ID` | Deploy/upgrade | Target chain ID. The deploy script requires it to match the chain selected by Hardhat. |
| `PROVIDER_URL` | Deploy/remote networks | JSON-RPC endpoint for the target chain. |
| `OWNER_ADDRESS` | Deploy/upgrade | Deployer and protocol owner; must match the configured signer. |
| `OWNER_PRIVATE_KEY` | Remote transactions | Private key used by Hardhat's remote-network account configuration. Never commit it. |
| `PERMIT2_ADDRESS` | Deploy | Existing Permit2 contract on the target chain; code is validated before reuse. |
| `ETHERSCAN_API_KEY` | Not currently used | Etherscan verification is disabled in Hardhat configuration. |
| `FORK_URL`, `FORK_BLOCK` | Optional tests | Fork source and optional block for the in-process Hardhat network. |
| `SOLIDITY_COVERAGE` | Coverage | Set automatically by `yarn coverage`; changes compiler settings. |
| `COVERAGE` | Optional tests | Legacy test flag used to lower gas-price assumptions. |
| `MASS_HOLDERS`, `GENERATION_MNEMONIC`, `GENERATION_OFFSET` | Stress test | Configuration for `test/z_mass_dividend_stress.spec.ts`. |

## Upgrade procedure

The current [`scripts/upgrade-contracts.ts`](./scripts/upgrade-contracts.ts) is not a general protocol upgrader. Its active code deploys a new `USDTieredSTO` implementation and factory, unregisters the old STO factory, and registers and verifies the new factory. The TRM, GTM, and Permit2 update blocks are commented out.

Before using it:

1. Review every active transaction in `upgrade-contracts.ts`.
2. Replace only the existing contract addresses in [`scripts/upgrade-config.ts`](./scripts/upgrade-config.ts).
3. Ignore the stale network, RPC, and owner fields in that config; the script reads those values from `.env`.
4. Confirm the target network and signer, then run:

```bash
npx hardhat run scripts/upgrade-contracts.ts --network monadTestnet
```

The script currently logs that Permit2 was updated even though that transaction is commented out. Verify all registry and factory state on-chain rather than relying only on its summary output.

After a deployment or upgrade, synchronize:

1. The deployment manifest.
2. Factory addresses and start blocks in `subgraph/subgraph.yaml`.
3. Hardcoded registry and token addresses in sibling `stf/` and `stf-backend/` applications.

## Subgraph

The local Docker stack and subgraph commands are separate: `yarn start` starts the services, while `yarn graph:all:local` builds and deploys the subgraph.

Monad endpoint:

```text
https://api.goldsky.com/api/public/project_cm9moyc1ryl5f01zza1uied1g/subgraphs/stf-monad-subgraph/1.0.0/gn
```

## Contract and token naming

`DummyERC20` and `FakeUSDT` are separate contracts:

- `contracts/mocks/DummyERC20.sol` is the configurable test token deployed by `deploy.ts` as an 18-decimal token named `Dai Token` with symbol `DAI`.
- `contracts/tokens/FakeUSDT.sol` is a fixed six-decimal legacy test token with symbol `FKT`; the current `deploy.ts` does not deploy it.

## Compiler configuration

Most contracts compile with Solidity 0.8.30, optimizer runs 200, `viaIR: true`, Yul disabled, and metadata bytecode hashes disabled. A secondary Solidity 0.8.17 compiler uses optimizer runs 1000. Coverage changes these settings, with a special 0.8.30 override for `USDTieredSTO`.

## Layout

```text
contracts/
  datastore/    DataStore implementation, proxy, storage, and factory
  external/     TradingRestrictionManager and external interfaces
  interfaces/   Protocol interfaces, including IPermit2
  libraries/    Shared Solidity libraries
  mocks/        Test-only contracts, including MockPermit2 and DummyERC20
  modules/      GTM, USDTieredSTO, PermissionManager, and dividends
  oracles/      StableOracle
  proxy/        Registry and upgradeability proxies
  tokens/       SecurityToken, STFactory, STGetter, and FakeUSDT
scripts/        Deploy, upgrade, ABI, and address-manifest files
subgraph/       Goldsky/The Graph schema, mappings, and configuration
test/           Hardhat TypeScript tests and helpers
```

## Documentation scope

- [`../README.md`](../README.md) and [`../docs/README.md`](../docs/README.md) explain the original Polymath architecture and historical Ethereum/Kovan deployments.
- `../docs/wiki/` documents the legacy Polymath CLI.
- `../docs/api/` contains generated Polymath-era Solidity API pages. It is not synchronized with the 0.8.x Hardhat contracts and does not document `TradingRestrictionManager` or Permit2.
- [VERIFY_TOKEN.md](./VERIFY_TOKEN.md) contains the current token-verification notes.
