# Token Contract Verification Guide

## Overview

This guide provides detailed instructions for verifying a token contract using Hardhat.

## Steps

### 1. Ensure Node.js Version Compatibility

Ensure that you are using Node.js version 18 or higher.

### 2. Install Required NPM Packages

Install Hardhat and the Hardhat Verify plugin by running the following commands:

```bash
npm install --save-dev hardhat
npm install --save-dev @nomicfoundation/hardhat-verify
```

### 3. Set the Correct Solc Version

Make sure to use Solc version 0.8.17+commit.8df45f5f.Linux.g++.

### 4. Prepare Arguments

Create a file named `arguments.js` and include the necessary details about the token from the SecurityTokenProxy constructor:

```javascript
module.exports = [
  "TEST", // _name
  "TST", // _symbol
  18,         // _decimals
  "1",        // _granularity. Note: If the token divisibility is "true" then it is 1, else it will be 10000000000000000000
  "-",        // _tokenDetails
  "0xA22a52b63A14eef0CDFeF4C2E72718B17fFE4c8f" // _polymathRegistry. This is currently 0xA22a52b63A14eef0CDFeF4C2E72718B17fFE4c8f
];
```

### 5. Verify the Contract

Run the following command to verify the contract:

```bash
npx hardhat verify --network bscMainnet --constructor-args arguments.js TOKEN_CONTRACT_ADDRESS
```

Replace `TOKEN_CONTRACT_ADDRESS` with the address of the token contract you wish to verify.

### 6. Cleanup

After verifying the contract, you can uninstall the installed NPM packages using the following commands:

```bash
npm uninstall --save-dev hardhat
npm uninstall --save-dev @nomicfoundation/hardhat-verify
```

## Conclusion

Following these steps will allow you to successfully verify your token contract on the BSC Mainnet.
