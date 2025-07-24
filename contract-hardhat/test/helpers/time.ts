import { network } from "hardhat";

/**
 * Mines a new block.
 */
export async function advanceBlock(): Promise<void> {
  await network.provider.send("evm_mine");
}

/**
 * Increases the EVM time by the given duration in seconds.
 * @param duration Number of seconds to increase time by
 */
export async function increaseTime(duration: number): Promise<void> {
  await network.provider.send("evm_increaseTime", [duration]);
  await advanceBlock();
}

/**
 * Takes a snapshot of the current blockchain state.
 * @returns The snapshot id
 */
export async function takeSnapshot(): Promise<string> {
  return await network.provider.send("evm_snapshot");
}

/**
 * Mines a block at a specific timestamp.
 * @param timestamp The timestamp to mine the block at (in seconds)
 */
export async function jumpToTime(timestamp: number): Promise<void> {
  await network.provider.send("evm_mine", [timestamp]);
  await advanceBlock();
}

/**
 * Reverts the blockchain state to a previous snapshot.
 * @param snapshotId The id of the snapshot to revert to
 */
export async function revertToSnapshot(snapshotId: string): Promise<void> {
  await network.provider.send("evm_revert", [snapshotId]);
}
