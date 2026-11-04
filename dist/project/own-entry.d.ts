/**
 * The entry a record holds under `key` as an own property, with the key narrowed to the record's own
 * keys; nothing when it holds none. A key that only an object's prototype has (`constructor`,
 * `toString`) is not an entry.
 *
 * It types the lookup by a name read from outside — a setting, a test option — for any record a
 * project declares, whether its keys are `string` or the project's own union of names.
 */
export declare function ownEntry<K extends string, V>(record: Readonly<Record<K, V>>, key: string): {
    readonly key: K;
    readonly value: V;
} | undefined;
