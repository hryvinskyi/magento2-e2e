/** Waits for `waiting`, and rejects naming `what` when it has not settled within `deadlineMs`; the timer keeps no process alive. */
export declare function withinDeadline<T>(waiting: Promise<T>, what: string, deadlineMs: number): Promise<T>;
