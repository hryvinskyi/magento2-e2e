import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** What module discovery reads from a Magento installation. */
export interface ModuleFileSystem {
    /** A file's text; nothing when there is no such file. */
    readText(path: string): string | undefined;
    /** The absolute paths of a directory's sub-directories; none when there is no such directory. */
    subdirectories(path: string): readonly string[];
    /** Whether the path is a directory, following symbolic links. */
    isDirectory(path: string): boolean;
    /** The path with every symbolic link resolved. */
    realPath(path: string): string;
}

/** Module discovery over the real file system. */
export const nodeModuleFiles: ModuleFileSystem = Object.freeze({
    readText(path: string): string | undefined {
        try {
            return readFileSync(path, 'utf8');
        } catch (error) {
            if (isMissing(error)) {
                return undefined;
            }

            throw error;
        }
    },
    subdirectories(path: string): readonly string[] {
        try {
            return readdirSync(path, { withFileTypes: true })
                .filter(entry => entry.isDirectory())
                .map(entry => join(path, entry.name));
        } catch (error) {
            if (isMissing(error)) {
                return [];
            }

            throw error;
        }
    },
    isDirectory(path: string): boolean {
        return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
    },
    realPath(path: string): string {
        return realpathSync(path);
    },
});

/** Whether a file system error says the path, or a directory on it, does not exist. */
function isMissing(error: unknown): boolean {
    return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}
