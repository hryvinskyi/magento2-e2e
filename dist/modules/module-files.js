"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeModuleFiles = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/** Module discovery over the real file system. */
exports.nodeModuleFiles = Object.freeze({
    readText(path) {
        try {
            return (0, node_fs_1.readFileSync)(path, 'utf8');
        }
        catch (error) {
            if (isMissing(error)) {
                return undefined;
            }
            throw error;
        }
    },
    subdirectories(path) {
        try {
            return (0, node_fs_1.readdirSync)(path, { withFileTypes: true })
                .filter(entry => entry.isDirectory())
                .map(entry => (0, node_path_1.join)(path, entry.name));
        }
        catch (error) {
            if (isMissing(error)) {
                return [];
            }
            throw error;
        }
    },
    isDirectory(path) {
        return (0, node_fs_1.statSync)(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
    },
    realPath(path) {
        return (0, node_fs_1.realpathSync)(path);
    },
});
/** Whether a file system error says the path, or a directory on it, does not exist. */
function isMissing(error) {
    return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}
