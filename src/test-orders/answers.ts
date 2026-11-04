/**
 * Reading what comes back from a request to the shop: the body of its answer, and the failure Playwright
 * reports when there is none. What is read here ends up in errors and annotations, and a report can be
 * read outside the team.
 */

/** Where the part of Playwright's error begins that lists everything the request sent. */
const CALL_LOG = 'Call log:';

/** A test-order proof: unix seconds, a dot, the signature. */
const PROOF_SHAPE = /\d{10}\.[0-9a-f]{64}/g;

/** What stands in a message where a proof was. */
const PROOF_REMOVED = '[proof removed]';

/** The most of a body that is not the shop's own reason worth quoting: a web server's error page is no reason. */
const QUOTED_BODY_LENGTH = 200;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** The value of a JSON body; nothing when the body is not JSON. */
export function jsonOf(body: string): unknown {
    try {
        return JSON.parse(body);
    } catch {
        return undefined;
    }
}

/** The start of a body, for a message that quotes it. */
export function quotedBody(body: string): string {
    return body.slice(0, QUOTED_BODY_LENGTH);
}

/** The reason in an error answer of the shop's REST API; the start of the body when it names none. */
export function shopReasonIn(body: string): string {
    const parsed = jsonOf(body);

    return isRecord(parsed) && typeof parsed.message === 'string' ? parsed.message : quotedBody(body);
}

/**
 * What a thrown value says went wrong, fit for a test error or a report. Playwright appends a call log
 * to a failed request's error that prints every header sent, the proof, cookies and any HTTP login
 * among them, so the message ends before it; anything of a proof's shape left elsewhere is replaced, in
 * case another Playwright version prints it there.
 *
 * An error built from this text carries no `cause`: the original would bring all of it back.
 */
export function reportableMessageOf(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const callLog = message.indexOf(CALL_LOG);
    const reason = callLog === -1 ? message : message.slice(0, callLog);

    return reason.trimEnd().replaceAll(PROOF_SHAPE, PROOF_REMOVED);
}
