import { isRecord } from '../../src/test-orders/answers';
import type { PlacementRoute } from '../../src/test-orders/placement';

/** The address of the invented checkout, at the web root. */
export const ACME_PLACEMENT = '/rest/V1/acme-checkout/place';

/**
 * A checkout of a project's own: it places at one address with no store code, the cart is in the JSON
 * body, and its answer names an order or sends the browser to pay first.
 */
export const ACME_CHECKOUT: PlacementRoute = {
    stopped: /\/acme-checkout\/place/,
    cartOf: (path, body, storePaths) => {
        const below = /^(.*\/)rest\/V1\/acme-checkout\/place$/.exec(path)?.[1];
        const anchored = below === '/' || (below !== undefined && storePaths.has(below));

        return anchored && typeof body.cartId === 'string' ? body.cartId : undefined;
    },
    outcomeOf: answer => {
        const parsed: unknown = JSON.parse(answer);

        if (isRecord(parsed) && typeof parsed.orderId === 'string') {
            return { kind: 'placed', orderId: parsed.orderId };
        }

        if (isRecord(parsed) && parsed.next === 'payment') {
            return { kind: 'after-payment' };
        }

        throw new Error('The checkout answered neither an order nor the way to payment.');
    },
};
