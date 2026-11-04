import type { Command } from './context';
/** SHA-256 of `user:password` in hex: the only form of the login the worker holds. */
export declare function credentialsDigest(user: string, password: string): string;
/**
 * The source of the gate in front of the shared test report on Cloudflare Pages: every request, on
 * every address of the project, needs the report's login, and the worker never serves a file itself.
 * Only the digest of the login is written into it, never the password.
 *
 * @param digest the hex SHA-256 of `user:password`
 * @param realm  the name the browser's sign-in prompt shows
 */
export declare function workerSource(digest: string, realm: string): string;
export declare const reportGateCommand: Command;
