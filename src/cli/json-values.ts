/** A parsed JSON object whose members are not known yet. */
export type JsonObject = Readonly<Record<string, unknown>>;

/** Whether a parsed JSON value is an object, as opposed to an array, a scalar or `null`. */
export function isJsonObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The text of a member, or `undefined` when it is absent or not text. */
export function textOf(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

/** The count a member holds, `0` when it is absent or not a finite number. */
export function countOf(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** The elements of a member that is an array; none otherwise. */
export function listOf(value: unknown): readonly unknown[] {
    return Array.isArray(value) ? value : [];
}
