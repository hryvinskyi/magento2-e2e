/** A parsed JSON object whose members are not known yet. */
export type JsonObject = Readonly<Record<string, unknown>>;
/** Whether a parsed JSON value is an object, as opposed to an array, a scalar or `null`. */
export declare function isJsonObject(value: unknown): value is JsonObject;
/** The text of a member, or `undefined` when it is absent or not text. */
export declare function textOf(value: unknown): string | undefined;
/** The count a member holds, `0` when it is absent or not a finite number. */
export declare function countOf(value: unknown): number;
/** The elements of a member that is an array; none otherwise. */
export declare function listOf(value: unknown): readonly unknown[];
