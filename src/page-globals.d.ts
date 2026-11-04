/**
 * What a Magento page puts on `window` that the package reaches through `page.evaluate()`. Only page
 * functions see these; Node never does. This file types the package's own compilation and is not
 * part of the types it publishes.
 */
interface Window {
    /**
     * The page's RequireJS loader: loads AMD modules by name and hands them to `onLoad` in the order
     * asked for, or calls `onError` when one cannot be loaded. Absent on a page that does not load
     * RequireJS. What it hands over is whatever the module defines, so a page function narrows each
     * module before using it.
     *
     * RequireJS publishes the same loader as `require` too; that name is not typed here because the
     * test runner's own Node `require` is a global of the same name, and the two types would merge.
     */
    readonly requirejs?: (
        dependencies: readonly string[],
        onLoad: (...modules: unknown[]) => void,
        onError?: (error: unknown) => void,
    ) => void;
}
