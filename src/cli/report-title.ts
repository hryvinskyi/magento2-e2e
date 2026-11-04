import type { EnvironmentVariables } from '../environment/variables';
import { setting } from '../environment/variables';

const DEFAULT_TITLE = 'Storefront checks';

/** The words the report and its e-mail are named with: `E2E_REPORT_TITLE`, or a neutral default. */
export function reportTitle(variables: EnvironmentVariables): string {
    return setting(variables, 'E2E_REPORT_TITLE') ?? DEFAULT_TITLE;
}
