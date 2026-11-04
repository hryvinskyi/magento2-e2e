"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Arrivals = void 0;
/**
 * Things a test sees arrive one after another — requests the browser answered or let through — kept
 * in order, counted, and awaited only when the test asks. Nothing waits in the background: a test
 * that never asks leaves no pending promise behind to fail after it ended.
 */
class Arrivals {
    seen = [];
    earliest = null;
    waiting = [];
    /** Records one arrival and hands it to everyone waiting for the first. */
    add(value) {
        this.seen.push(value);
        this.earliest ??= { value };
        for (const resolve of this.waiting.splice(0)) {
            resolve(value);
        }
    }
    /** How many have arrived so far. */
    count() {
        return this.seen.length;
    }
    /** Everything that has arrived so far, oldest first. */
    all() {
        return [...this.seen];
    }
    /**
     * Resolves with the first arrival, whether it came already or comes later; rejects naming
     * `what` when nothing has arrived within `timeoutMs`.
     */
    first(what, timeoutMs) {
        if (this.earliest !== null) {
            return Promise.resolve(this.earliest.value);
        }
        return new Promise((resolve, reject) => {
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
exports.Arrivals = Arrivals;
