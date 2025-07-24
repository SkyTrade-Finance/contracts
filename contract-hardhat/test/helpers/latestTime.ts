import { ethers } from "hardhat";

// Returns the time of the last mined block in seconds
async function latestTime(): Promise<number> {
    const block = await latestBlock();
    if (!block) throw new Error("Failed to fetch latest block");
    return block.timestamp;
}

async function latestBlock() {
    return await ethers.provider.getBlock("latest");
}

export { latestTime, latestBlock };
