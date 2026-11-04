import { expect, test } from '@playwright/test';
import { Arrivals } from '../../src/arrivals';

test.describe('arrivals', () => {
    test('are kept in order and counted', () => {
        const arrivals = new Arrivals<string>();

        expect(arrivals.count()).toBe(0);
        arrivals.add('first');
        arrivals.add('second');

        expect(arrivals.count()).toBe(2);
        expect(arrivals.all()).toEqual(['first', 'second']);
    });

    test('hand out a copy, so a caller cannot change what was seen', () => {
        const arrivals = new Arrivals<number>();

        arrivals.add(1);
        const seen = arrivals.all();

        arrivals.add(2);

        expect(seen).toEqual([1]);
    });

    test('answer the first arrival when it came already', async () => {
        const arrivals = new Arrivals<string>();

        arrivals.add('early');
        arrivals.add('late');

        await expect(arrivals.first('a request', 10)).resolves.toBe('early');
    });

    test('answer the first arrival when it comes later, to everyone waiting', async () => {
        const arrivals = new Arrivals<string>();
        const waiting = [arrivals.first('a request', 1_000), arrivals.first('a request', 1_000)];

        arrivals.add('first');
        arrivals.add('second');

        await expect(Promise.all(waiting)).resolves.toEqual(['first', 'first']);
    });

    test('reject naming what was awaited when nothing arrives in time', async () => {
        await expect(new Arrivals<string>().first('the click report', 50))
            .rejects.toThrow('the click report: nothing arrived within 0.05 s.');
    });
});
