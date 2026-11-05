import type { Page, Route } from '@playwright/test';
import type { PlacementRoute } from './placement';
import type { ShopClient } from './shop';
/** What the shop answered a signed placement, with the route that reads it. */
export interface AnsweredPlacement {
    readonly kind: 'answered';
    readonly maskedCartId: string;
    readonly route: PlacementRoute;
    readonly status: number;
    /** The answer's body; null when the page left before it could be read. */
    readonly body: string | null;
}
/** What the page sent when it tried to turn a cart into an order. */
export type PlacementAttempt = AnsweredPlacement | {
    readonly kind: 'unanswered';
    readonly reason: string;
} | {
    readonly kind: 'redirected';
    readonly status: number;
    readonly location: string;
} | {
    readonly kind: 'refused';
    readonly reason: string;
};
/** One placement that holds its proof and is about to leave for the shop. */
export interface SignedRequest {
    /** The page that sent the request. */
    readonly page: Page;
    /** The browser's request, held at the route. */
    readonly route: Route;
    readonly maskedCartId: string;
    /** The route that named the cart, which reads the shop's answer. */
    readonly placement: PlacementRoute;
    /** The headers that prove the placement. */
    readonly proof: Readonly<Record<string, string>>;
    /** How long the shop may take to answer, the answer's body included. */
    readonly deadlineMs: number;
    /** Takes what became of the placement, or the wait for it: a promise that never rejects. */
    readonly report: (attempt: PlacementAttempt | Promise<PlacementAttempt>) => void;
}
/** Sends a signed placement on its way and answers the browser's request. */
type PlacementSender = (signed: SignedRequest) => Promise<void>;
/** How a signed placement reaches the shop, per client. */
export declare const PLACEMENT_SENDERS: Readonly<Record<ShopClient, PlacementSender>>;
export {};
