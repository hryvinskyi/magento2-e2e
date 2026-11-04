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
export declare const nodeModuleFiles: ModuleFileSystem;
