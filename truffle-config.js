require('babel-register');
require('babel-polyfill');
require('dotenv').config();
const fs = require('fs');
const NonceTrackerSubprovider = require("web3-provider-engine/subproviders/nonce-tracker")

const HDWalletProvider = require("truffle-hdwallet-provider");

let ver;
if (process.env.POLYMATH_NATIVE_SOLC) {
  ver = "native";
} else {
  ver = "0.5.8";
}

module.exports = {
  networks: {
    development: {
      host: '127.0.0.1',
      port: 8545,
      network_id: '1337', // Match any network id
      gas: 8000000
    },
    mainnet: {
      host: 'localhost',
      port: 8545,
      network_id: '1', // Match any network id
      gas: 7900000,
      gasPrice: 10000000000
    },
    ropsten: {
      // provider: new HDWalletProvider(privKey, "http://localhost:8545"),
      host: 'localhost',
      port: 8545,
      network_id: '3', // Match any network id
      gas: 4500000,
      gasPrice: 150000000000
    },
    rinkeby: {
      // provider: new HDWalletProvider(privKey, "http://localhost:8545"),
      host: 'localhost',
      port: 8545,
      network_id: '4', // Match any network id
      gas: 7500000,
      gasPrice: 10000000000
    },
    kovan: {
      provider: () => {
        const key = fs.readFileSync('./privKey').toString();
        let wallet = new HDWalletProvider(key, "https://kovan.infura.io/")
        var nonceTracker = new NonceTrackerSubprovider()
        wallet.engine._providers.unshift(nonceTracker)
        nonceTracker.setEngine(wallet.engine)
        return wallet
      },
      network_id: '42', // Match any network id
      gas: 7900000,
      gasPrice: 5000000000
    },
    bscMainnet: {
      provider: () => {
        const key = "";
        let wallet = new HDWalletProvider(key, "https://bsc-dataseed.bnbchain.org")
        var nonceTracker = new NonceTrackerSubprovider()
        wallet.engine._providers.unshift(nonceTracker)
        nonceTracker.setEngine(wallet.engine)
        return wallet
      },
      network_id: '56', // Match any network id
      gas: 11000000,
      gasPrice: 10000000000 // 10 Gwei
    },
    bscTestnet: {
      provider: () => {
        const key = "";
        let wallet = new HDWalletProvider(key, "https://bsc-testnet-dataseed.bnbchain.org")
        var nonceTracker = new NonceTrackerSubprovider()
        wallet.engine._providers.unshift(nonceTracker)
        nonceTracker.setEngine(wallet.engine)
        return wallet
      },
      network_id: '97', // Match any network id
      gas: 11000000,
      gasPrice: 10000000000 // 10 Gwei
    },
    coverage: {
      host: "localhost",
      network_id: "*",
      port: 8545, // <-- If you change this, also set the port option in .solcover.js.
      gas: 0xfffffffff, // <-- Use this high gas value
      gasPrice: 0x01 // <-- Use this low gas price
    },
    monadTestnet: {
      // from: "your_ethereum_address", // Replace with your Ethereum address corresponding to the private key
      // provider: () => {
      //   const key = fs.readFileSync('./privKey').toString();
      //   return new Web3.providers.HttpProvider('https://goerli-rollup.arbitrum.io/rpc', { privateKeys: [key] });
      // },
      provider: () => {
        const key = "";
        let wallet = new HDWalletProvider(key, "https://quick-alpha-lake.monad-testnet.quiknode.pro/c299af5e09c057f57dfb9985747c7f131b19839e/")
        var nonceTracker = new NonceTrackerSubprovider()
        wallet.engine._providers.unshift(nonceTracker)
        nonceTracker.setEngine(wallet.engine)
        return wallet
      },
      network_id: '10143', // Match any network id
      gas: 11000000,
      gasPrice: 50000000000 // 10 Gwei
    }
  },
  compilers: {
    solc: {
      version: '0.8.30',
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  },
  mocha: {
    enableTimeouts: false
  }
};
