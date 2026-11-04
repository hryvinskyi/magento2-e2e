import type { ProjectConfig } from './project';
/**
 * Every way a project definition contradicts itself or the package's rules, one sentence each;
 * nothing when it is valid.
 */
export declare function projectProblems(config: ProjectConfig): readonly string[];
