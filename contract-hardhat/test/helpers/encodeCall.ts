import { ethers } from "hardhat";

export function encodeProxyCall (parametersType: string[], values: any[]) {
    const iface = new ethers.Interface([`function initialize(${parametersType.join(',')})`]);
    return iface.encodeFunctionData("initialize", values);
}

export function encodeModuleCall (parametersType: string[], values: any[]) {
    const iface = new ethers.Interface([`function configure(${parametersType.join(',')})`]);
    return iface.encodeFunctionData("configure", values);
}

export function encodeCall (methodName: string, parametersType: string[], values: any[]) {
    const iface = new ethers.Interface([`function ${methodName}(${parametersType.join(',')})`]);
    return iface.encodeFunctionData(methodName, values);
}

    /**
     * @notice Generates a signature for updating the Merkle root
     * @param signer The signer account (should be an operator)
     * @param merkleRoot The Merkle root hash
     * @param expiryTime The expiry timestamp
     * @returns The signature bytes
     */
    export const generateMerkleRootSignature = async (
        signer: any,
        merkleRoot: string,
        expiryTime: number | bigint
    ): Promise<string> => {
        // Create the message hash (same as in the smart contract)
        const messageHash = ethers.solidityPackedKeccak256(
            ["bytes32", "uint64"],
            [merkleRoot, expiryTime]
        );
        
        // Sign the message hash
        // This automatically adds the Ethereum Signed Message prefix
        const signature = await signer.signMessage(ethers.getBytes(messageHash));
        
        return signature;
    }


