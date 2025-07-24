# Token Contract Verification Guide

## Overview

This guide outlines the steps to verify a token contract using Hardhat.

## Steps

### 1. Set correct solc version

Make sure to use solc version 0.8.17+commit.8df45f5f.Linux.g++

sudo service postgresql stop

### 2. Prepare Arguments

Create a file named `arguments.js` and include the necessary details about the token from the SecurityTokenProxy constructor.

```javascript
module.exports = [
  "Test", // _name
  "TST", // _symbol
  18,         // _decimals
  "1",        // _granularity. Note: If the token divisibility is "true" then it is 1, else it will be 10000000000000000000
  "-",        // _tokenDetails
  "0x81d2d5b63b24826930290362C7F5062DA55DFFD7" // _polymathRegistry. This is currently 0x81d2d5b63b24826930290362C7F5062DA55DFFD7
];
```

### 3. Verify Contract

Run the following command:

```bash
npx hardhat verify --network bscTestnet --constructor-args arguments.js TOKEN_CONTRACT_ADDRESS
```

Replace `TOKEN_CONTRACT_ADDRESS` with the address of the token contract you wish to verify.

## Conclusion

Following these steps will allow you to verify your token contract on the BSC Mainnet successfully.
