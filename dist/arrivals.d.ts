/**
 * Things a test sees arrive one after another — requests the browser answered or let through — kept
 * in order, counted, and awaited only when the test asks. Nothing waits in the background: a test
 * that never asks leaves no pending promise behind to fail after it ended.
 */
export declare class Arrivals<T> {
    private readonly seen;
    private earliest;
    private readonly waiting;
    /** Records one arrival and hands it to everyone waiting for the first. */
    add(value: T): void;
    /** How many have arrived so far. */
    count(): number;
    /** Everything that has arrived so far, oldest first. */
    all(): readonly T[];
    /**
     * Resolves with the first arrival, whether it came already or comes later; rejects naming
     * `what` when nothing has arrived within `timeoutMs`.
     */
    first(what: string, timeoutMs: number): Promise<T>;
}
