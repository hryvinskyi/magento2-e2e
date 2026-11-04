import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * A directory that holds the given files, relative path → content, created afresh below the system's
 * temporary directory. The caller removes it when done.
 */
export function temporaryDirectory(files: Readonly<Record<string, string>>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'magento2-e2e-'));

    for (const [file, content] of Object.entries(files)) {
        const target = path.join(root, file);

        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
    }

    return root;
}
