"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withinDeadline = withinDeadline;
/** Waits for `waiting`, and rejects naming `what` when it has not settled within `deadlineMs`; the timer keeps no process alive. */
async function withinDeadline(waiting, what, deadlineMs) {
    let timer;
    const deadline = new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
            reject(new Error(`${what}: nothing arrived within ${String(deadlineMs / 1_000)} s.`));
        }, deadlineMs);
        timer.unref();
    });
    try {
        return await Promise.race([waiting, deadline]);
    }
    finally {
        clearTimeout(timer);
    }
}
