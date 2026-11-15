"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMIN_MARKUP = void 0;
/**
 * The markup of Magento's admin the package reads, in one place: the stock backend theme's sign-in page,
 * menu, messages and loading masks.
 */
exports.ADMIN_MARKUP = Object.freeze({
    /** The sign-in form, on the sign-in page and wherever a session has ended. */
    signInForm: 'form#login-form',
    /** The user name field of the sign-in form. */
    userName: 'input[name="login[username]"]',
    /** The password field of the sign-in form. */
    password: 'input[name="login[password]"]',
    /** The sign-in form's submit button; a button without a type submits its form, as the stock one does. */
    signIn: 'button:not([type]), button[type="submit"], input[type="submit"]',
    /** A CAPTCHA in the sign-in form: Magento's own image CAPTCHA, or a reCAPTCHA widget. */
    captcha: 'input[name^="captcha["], .g-recaptcha, iframe[src*="recaptcha"]',
    /** An error the sign-in page shows, as after a refused sign-in. */
    signInError: '.messages .message-error',
    /** The page's messages area, where a save reports what it did; `{kind}` is success, error, warning or notice. */
    message: '.messages .message-{kind}',
    /** What the admin draws over a page while it loads data: the page's mask, a grid's, a form's, and spinners. */
    loading: '.loading-mask, .admin__data-grid-loading-mask, .admin__form-loading-mask, [data-role="spinner"]',
    /** The form key a page keeps for its own forms, when the page has no `FORM_KEY` global. */
    formKey: 'input[name="form_key"]',
});
