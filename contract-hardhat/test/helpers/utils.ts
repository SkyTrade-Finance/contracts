import { assert } from "chai";
import { ethers } from "hardhat";

export function isException(error: any): boolean {
    const strError = error.toString();
    return (
        strError.includes("invalid opcode") ||
        strError.includes("invalid JUMP") ||
        strError.includes("revert")
    );
}

export function ensureException(error: any): void {
    assert(isException(error), error.toString());
}

export async function timeDifference(timestamp1: number, timestamp2: number): Promise<number> {
    return timestamp1 - timestamp2;
}

export function convertHex(hexx: string | Buffer): string {
    let hex = hexx.toString();
    let str = "";
    for (let i = 0; i < hex.length; i += 2) {
        const char = String.fromCharCode(parseInt(hex.substr(i, 2), 16));
        if (char !== "\u0000") str += char;
    }
    return str;
}

export const duration = {
    seconds(val: number): number {
        return val;
    },
    minutes(val: number): number {
        return val * this.seconds(60);
    },
    hours(val: number): number {
        return val * this.minutes(60);
    },
    days(val: number): number {
        return val * this.hours(24);
    },
    weeks(val: number): number {
        return val * this.days(7);
    },
    years(val: number): number {
        return val * this.days(365);
    }
};

export async function latestBlock(): Promise<number> {
    const block = await ethers.provider.getBlock("latest");
    return block?.number ?? 0;
}
