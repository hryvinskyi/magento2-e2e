"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processEnvFile = void 0;
exports.loadEnvFile = loadEnvFile;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
/** Loading into the running process, with Node's own `.env` parser. */
exports.processEnvFile = Object.freeze({
    exists(file) {
        return (0, node_fs_1.existsSync)(file);
    },
    load(file) {
        process.loadEnvFile(file);
    },
});
/**
 * Applies the `.env` file beside the Playwright config, when there is one. A variable already set in
 * the environment wins over the file, so a CI job or a one-off `E2E_ENV=… npx playwright test`
 * overrides a developer's file without editing it.
 *
 * The config is evaluated in the runner and again in every worker, so the file is applied before any
 * fixture reads a setting.
 */
function loadEnvFile(configDir, loader = exports.processEnvFile) {
    const file = node_path_1.default.join(configDir, '.env');
    if (loader.exists(file)) {
        loader.load(file);
    }
}
