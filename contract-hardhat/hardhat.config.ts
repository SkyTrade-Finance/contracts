import { HardhatUserConfig } from "hardhat/config";
import dotenv from "dotenv";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";


const dotenvResult = dotenv.config();
if (dotenvResult.error) {
  throw dotenvResult.error;
}

const { PROVIDER_URL, OWNER_PRIVATE_KEY, ETHERSCAN_API_KEY } = process.env;
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
            enabled: true,
            runs: 200,
            details: { yul: false },
          },
          viaIR: true,
          metadata: {
            bytecodeHash: "none", // disable ipfs
            useLiteralContent: true, // use source code
          },
        },
      },
    ],
  },
  networks: {
    local: {
      url: PROVIDER_URL,
      chainId: 31337,
    },
    hardhat: {
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
