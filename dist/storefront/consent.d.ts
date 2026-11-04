import type { ConsentPolicy } from '../project/project';
/**
 * Records consent as the cookie the shop's consent banner reads: before a visit, the cookie `name`
 * with `value` is added for the store's base URL, unless the browser already holds a cookie of that
 * name there — a test that set its own consent, or the shop that rewrote it, keeps its value.
 */
export declare function consentCookie(name: string, value: string): ConsentPolicy;
