/**
 * Things a test sees arrive one after another — requests the browser answered or let through — kept
 * in order, counted, and awaited only when the test asks. Nothing waits in the background: a test
 * that never asks leaves no pending promise behind to fail after it ended.
 */
export class Arrivals<T> {
    private readonly seen: T[] = [];
    private earliest: { readonly value: T } | null = null;
    private readonly waiting: ((value: T) => void)[] = [];

    /** Records one arrival and hands it to everyone waiting for the first. */
    public add(value: T): void {
        this.seen.push(value);
        this.earliest ??= { value };

        for (const resolve of this.waiting.splice(0)) {
            resolve(value);
        }
    }

    /** How many have arrived so far. */
    public count(): number {
        return this.seen.length;
    }

    /** Everything that has arrived so far, oldest first. */
    public all(): readonly T[] {
        return [...this.seen];
    }

    /**
     * Resolves with the first arrival, whether it came already or comes later; rejects naming
     * `what` when nothing has arrived within `timeoutMs`.
     */
    public first(what: string, timeoutMs: number): Promise<T> {
        if (this.earliest !== null) {
            return Promise.resolve(this.earliest.value);
        }

        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`${what}: nothing arrived within ${String(timeoutMs / 1_000)} s.`));
            }, timeoutMs);

            timer.unref();
            this.waiting.push(value => {
                clearTimeout(timer);
                resolve(value);
            });
        });
    }
}
