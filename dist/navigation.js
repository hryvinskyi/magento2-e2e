"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.navigatesThePage = navigatesThePage;
/**
 * Whether a request navigates the page itself. Opening a frame inside the page is a navigation too, and
 * Playwright has no frame to name for one still being created, which is never the page's own.
 */
function navigatesThePage(request, page) {
    if (!request.isNavigationRequest()) {
        return false;
    }
    try {
        return request.frame() === page.mainFrame();
    }
    catch {
        return false;
    }
}
