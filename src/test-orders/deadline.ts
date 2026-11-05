/** Waits for `waiting`, and rejects naming `what` when it has not settled within `deadlineMs`; the timer keeps no process alive. */
export async function withinDeadline<T>(waiting: Promise<T>, what: string, deadlineMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
            reject(new Error(`${what}: nothing arrived within ${String(deadlineMs / 1_000)} s.`));
        }, deadlineMs);
        timer.unref();
    });

    try {
        return await Promise.race([waiting, deadline]);
    } finally {
        clearTimeout(timer);
    }
}
