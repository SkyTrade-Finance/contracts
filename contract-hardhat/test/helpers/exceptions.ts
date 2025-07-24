import { assert } from "chai";

const PREFIX = "VM Exception while processing transaction: ";
const PREFIX2 = "Returned error: VM Exception while processing transaction: ";

// async function tryCatch(promise: Promise<any>, message: string): Promise<void> {
//     try {
//         await promise;
//         throw null;
//     } catch (error: any) {
//         assert(error, "Expected an error but did not get one");
//         try {
//             assert(
//                 error.message.startsWith(PREFIX + message),
//                 "Expected an error starting with '" + PREFIX + message + "' but got '" + error.message + "' instead"
//             );
//         } catch (err) {
//             assert(
//                 error.message.startsWith(PREFIX2 + message),
//                 "Expected an error starting with '" + PREFIX + message + "' but got '" + error.message + "' instead"
//             );
//         }
//     }
// }

async function tryCatch(promise: Promise<any>, message: string, allowNoReason = false) {
    try {
        await promise;
        assert.fail("Expected an error but none was received");
    } catch (error: any) {
        const revertString = error?.message || error?.toString();
        if (revertString.includes(message)) return;

        if (allowNoReason && revertString.includes("Transaction reverted without a reason string")) return;

        assert.fail(`Expected an error starting with '${message}' but got '${revertString}' instead`);
    }
}


interface ExceptionHelpers {
    catchRevert: (promise: Promise<any>) => Promise<void>;
    catchPermission: (promise: Promise<any>) => Promise<void>;
    catchOutOfGas: (promise: Promise<any>) => Promise<void>;
    catchInvalidJump: (promise: Promise<any>) => Promise<void>;
    catchInvalidOpcode: (promise: Promise<any>) => Promise<void>;
    catchStackOverflow: (promise: Promise<any>) => Promise<void>;
    catchStackUnderflow: (promise: Promise<any>) => Promise<void>;
    catchStaticStateChange: (promise: Promise<any>) => Promise<void>;
}

const exceptionHelpers: ExceptionHelpers = {
    catchRevert: async function(promise: Promise<any>): Promise<void> {
        await tryCatch(promise, "revert", true);
    },
    catchPermission: async function(promise: Promise<any>): Promise<void> {
        await tryCatch(promise, "revert Permission check failed");
    },
    catchOutOfGas: async function(promise: Promise<any>): Promise<void> {
        await tryCatch(promise, "out of gas");
    },
    catchInvalidJump: async function(promise: Promise<any>): Promise<void> {
        await tryCatch(promise, "invalid JUMP");
    },
    catchInvalidOpcode: async function(promise: Promise<any>): Promise<void> {
        await tryCatch(promise, "invalid opcode");
    },
    catchStackOverflow: async function(promise: Promise<any>): Promise<void> {
        await tryCatch(promise, "stack overflow");
    },
    catchStackUnderflow: async function(promise: Promise<any>): Promise<void> {
        await tryCatch(promise, "stack underflow");
    },
    catchStaticStateChange: async function(promise: Promise<any>): Promise<void> {
        await tryCatch(promise, "static state change");
    }
};

export = exceptionHelpers;
