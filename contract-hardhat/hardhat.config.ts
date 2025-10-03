import { HardhatUserConfig } from "hardhat/config";
import dotenv from "dotenv";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";


const dotenvResult = dotenv.config();
if (dotenvResult.error) {
  throw dotenvResult.error;
}

const { PROVIDER_URL, OWNER_PRIVATE_KEY, ETHERSCAN_API_KEY, SOLIDITY_COVERAGE, FORK_URL, FORK_BLOCK } = process.env;
const isCoverage = !!SOLIDITY_COVERAGE;
const shouldFork = !!FORK_URL;
const accounts = [...(OWNER_PRIVATE_KEY ? [OWNER_PRIVATE_KEY] : [])];

const config: HardhatUserConfig = {
  mocha: {
    timeout: 900000,
  },
  solidity: {
    compilers: [
      {
        version: "0.8.30",
        settings: {
          optimizer: {
            enabled: !isCoverage,
            runs: 200,
            details: { yul: false },
          },
          viaIR: isCoverage ? false : true,
          metadata: {
            bytecodeHash: "none", // disable ipfs
            useLiteralContent: true, // use source code
          },
        },
      },
      {
        version: "0.8.17",
        settings: {
          optimizer: {
            enabled: !isCoverage,
            runs: 1000,
          },
          viaIR: isCoverage ? false : true,
        },
      },
    ],
    overrides: isCoverage ? {
      "contracts/modules/STO/USDTiered/USDTieredSTO.sol": {
        version: "0.8.30",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
          metadata: { bytecodeHash: "none", useLiteralContent: true },
        },
      },
    } : {}
  },
  networks: {
    local: {
      url: PROVIDER_URL,
      chainId: 31337,
    },
    hardhat: {
      // Only fork when FORK_URL is explicitly provided; disable during coverage.
      forking: !isCoverage && shouldFork ? {
        url: FORK_URL as string,
        blockNumber: FORK_BLOCK ? Number(FORK_BLOCK) : undefined,
      } : undefined,
      chainId: 1337,
    },
    localhost: {
      chainId: 1337,
      url: "http://localhost:8545",
    },
    baseSepolia: {
      url: PROVIDER_URL,
      accounts,
      chainId: 84532,
      timeout: 60 * 60 * 1000, // 1 hour
    },
    monadTestnet: {
      url: PROVIDER_URL,
      accounts,
      chainId: 10143,
      timeout: 60 * 60 * 1000, // 1 hour
    },
    bnbMainnet: {
      url: PROVIDER_URL,
      accounts,
      chainId: 56,
      timeout: 60 * 60 * 1000, // 1 hour
    },
    polygonMainnet: {
      url: PROVIDER_URL,
      accounts,
      chainId: 137,
      timeout: 60 * 60 * 1000, // 1 hour
    },
    mantleMainnet: {
      url: PROVIDER_URL,
      accounts,
      chainId: 5000,
      timeout: 60 * 60 * 1000, // 1 hour
    },
  },
  sourcify: {
    enabled: true,
    apiUrl: "https://sourcify-api-monad.blockvision.org",
    browserUrl: "https://testnet.monadexplorer.com"
  },
  etherscan: {
    enabled: false
  }
};
export default config;
