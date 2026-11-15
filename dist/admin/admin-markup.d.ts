/** The selectors of the admin's markup the package reads. */
export interface AdminMarkup {
    readonly signInForm: string;
    readonly userName: string;
    readonly password: string;
    readonly signIn: string;
    readonly captcha: string;
    readonly signInError: string;
    readonly message: string;
    readonly loading: string;
    readonly formKey: string;
}
/**
 * The markup of Magento's admin the package reads, in one place: the stock backend theme's sign-in page,
 * menu, messages and loading masks.
 */
export declare const ADMIN_MARKUP: AdminMarkup;
