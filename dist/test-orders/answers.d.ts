/**
 * Reading what comes back from a request to the shop: the body of its answer, and the failure Playwright
 * reports when there is none. What is read here ends up in errors and annotations, and a report can be
 * read outside the team.
 */
export declare const isRecord: (value: unknown) => value is Record<string, unknown>;
/** The value of a JSON body; nothing when the body is not JSON. */
export declare function jsonOf(body: string): unknown;
/** The start of a body, for a message that quotes it. */
export declare function quotedBody(body: string): string;
/** The reason in an error answer of the shop's REST API; the start of the body when it names none. */
export declare function shopReasonIn(body: string): string;
/**
 * What a thrown value says went wrong, fit for a test error or a report. Playwright appends a call log
 * to a failed request's error that prints every header sent, the proof, cookies and any HTTP login
 * among them, so the message ends before it; anything of a proof's shape left elsewhere is replaced, in
 * case another Playwright version prints it there.
 *
 * An error built from this text carries no `cause`: the original would bring all of it back.
 */
export declare function reportableMessageOf(error: unknown): string;
