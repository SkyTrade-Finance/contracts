import { Addressable, ethers } from "ethers";

import {
  SignatureTransfer, // Useful for generating permit data for signature style approvals
  PermitTransferFrom,
  PERMIT2_ADDRESS
} from "@uniswap/permit2-sdk";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Generate Permit2 data with real signature from user's wallet
 */
export const generatePermit2Data = async (
  tokenAddress: string | Addressable,
  amountInWei: string,
  spender: string,
  signer: ethers.JsonRpcSigner | HardhatEthersSigner,
  chainId: number
): Promise<{
  permit: PermitTransferFrom;
  permitSignature: string;
}> => {
  const currentTime = Math.floor(Date.now() / 1000);
  const deadline = currentTime + 172800; // 2 days from now
  const nonce = Math.floor(Math.random() * 1e15); // 1 quadrillion potential nonces

  const permit = {
    permitted: {
      token: tokenAddress,
      amount: amountInWei,
    },
    spender: spender,
    nonce: nonce,
    deadline: deadline,
  };

  // Generate the permit return data & sign it
  const { domain, types, values } = SignatureTransfer.getPermitData(
    permit,
    PERMIT2_ADDRESS,
    chainId
  );
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const signature = await signer.signTypedData(domain, types, values);

  return {
    permit,
    permitSignature: signature,
  };
};

/**
 * ERC20 Permit data structure
 */
export interface ERC20PermitData {
  owner: string;
  spender: string;
  value: string;
  deadline: number;
  v: number;
  r: string;
  s: string;
}

/**
 * Generate ERC20 Permit signature data (EIP-2612)
 * This works with tokens that support the permit() function
 */
export const generateERC20PermitData = async (
  tokenAddress: string,
  tokenName: string,
  owner: string,
  spender: string,
  value: string,
  signer: ethers.JsonRpcSigner,
  chainId: number,
  tokenVersion: string = "1"
): Promise<ERC20PermitData> => {
  const currentTime = Math.floor(Date.now() / 1000);
  const deadline = currentTime + 36000; // 1 hour from now

  // Get the current nonce for the owner from the token contract
  const tokenContract = new ethers.Contract(
    tokenAddress,
    [
      "function nonces(address owner) view returns (uint256)",
      "function name() view returns (string)",
    ],
    signer
  );

  let nonce: bigint;
  try {
    nonce = await tokenContract.nonces(owner);
  } catch (error) {
    // Fallback to 0 if nonces function doesn't exist or fails
    console.warn("Could not fetch nonce from token contract, using 0:", error);
    nonce = BigInt(Math.floor(Math.random() * 1e15)); 
  }

  // EIP-2612 domain separator
  const domain = {
    name: tokenName,
    version: tokenVersion,
    chainId: chainId,
    verifyingContract: tokenAddress,
  };

  // EIP-2612 Permit type
  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  // Permit message
  const message = {
    owner: owner,
    spender: spender,
    value: value,
    nonce: nonce.toString(),
    deadline: deadline,
  };

  // Generate signature
  const signature = await signer.signTypedData(domain, types, message);
  
  // Split signature into v, r, s components
  const sig = ethers.Signature.from(signature);

  return {
    owner: owner,
    spender: spender,
    value: value,
    deadline: deadline,
    v: sig.v,
    r: sig.r,
    s: sig.s,
  };
};

/**
 * Helper function to check if a token supports ERC20 Permit (EIP-2612)
 */
export const supportsERC20Permit = async (
  tokenAddress: string,
  signer: ethers.JsonRpcSigner
): Promise<boolean> => {
  try {
    const tokenContract = new ethers.Contract(
      tokenAddress,
      [
        "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
        "function nonces(address owner) view returns (uint256)",
        "function DOMAIN_SEPARATOR() view returns (bytes32)",
      ],
      signer
    );

    // Check if the contract has the required permit functions
    await tokenContract.DOMAIN_SEPARATOR.staticCall();
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Execute ERC20 permit transaction
 */
export const executeERC20Permit = async (
  tokenAddress: string,
  permitData: ERC20PermitData,
): Promise<{ to: string, data: string }> => {
  const abi = ["function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external"];
  const iface = new ethers.Interface(abi);

  const data = iface.encodeFunctionData("permit", [
    permitData.owner,
    permitData.spender,
    permitData.value,
    permitData.deadline,
    permitData.v,
    permitData.r,
    permitData.s
  ]);

  return {
    to: tokenAddress,
    data: data,
  };

};


