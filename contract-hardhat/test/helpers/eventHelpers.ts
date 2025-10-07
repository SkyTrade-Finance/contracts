import { Contract, ContractTransactionReceipt, LogDescription } from "ethers";

/**
 * Event Helper Utilities
 * Common functions for parsing and verifying contract events
 */

/**
 * Find and parse an event from a transaction receipt
 * @param receipt Transaction receipt containing logs
 * @param contract Contract instance to use for parsing
 * @param eventName Name of the event to find
 * @returns Parsed event or null if not found
 */
export async function findEvent(
    receipt: ContractTransactionReceipt | null,
    contract: Contract,
    eventName: string
): Promise<LogDescription | null> {
    if (!receipt) return null;

    for (const log of receipt.logs) {
        try {
            const parsed = contract.interface.parseLog({
                topics: [...log.topics],
                data: log.data
            });
            
            if (parsed && parsed.name === eventName) {
                return parsed;
            }
        } catch (err) {
            // Log may belong to different contract
            continue;
        }
    }

    return null;
}

/**
 * Find and parse multiple events of the same type from a transaction receipt
 * @param receipt Transaction receipt containing logs
 * @param contract Contract instance to use for parsing
 * @param eventName Name of the event to find
 * @returns Array of parsed events
 */
export async function findEvents(
    receipt: ContractTransactionReceipt | null,
    contract: Contract,
    eventName: string
): Promise<LogDescription[]> {
    if (!receipt) return [];

    const events: LogDescription[] = [];

    for (const log of receipt.logs) {
        try {
            const parsed = contract.interface.parseLog({
                topics: [...log.topics],
                data: log.data
            });
            
            if (parsed && parsed.name === eventName) {
                events.push(parsed);
            }
        } catch (err) {
            // Log may belong to different contract
            continue;
        }
    }

    return events;
}

/**
 * Verify an event was emitted with expected arguments
 * @param receipt Transaction receipt
 * @param contract Contract instance
 * @param eventName Event name to check
 * @param expectedArgs Object with expected argument values
 * @returns true if event matches expectations
 */
export async function verifyEvent(
    receipt: ContractTransactionReceipt | null,
    contract: Contract,
    eventName: string,
    expectedArgs: Record<string, any>
): Promise<boolean> {
    const event = await findEvent(receipt, contract, eventName);
    if (!event) return false;

    for (const [key, value] of Object.entries(expectedArgs)) {
        if (event.args[key] !== value) {
            return false;
        }
    }

    return true;
}


