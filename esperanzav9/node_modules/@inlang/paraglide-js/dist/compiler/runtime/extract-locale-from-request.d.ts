export function extractLocaleFromRequest(request: Request, options?: ExtractLocaleFromRequestOptions): Locale;
export function extractLocaleFromRequestWithStrategies(request: Request, strategies: typeof strategy, url?: string | URL): Locale;
export type ExtractLocaleFromRequestOptions = {
    /**
     * - Effective request URL to use for route matching and locale detection with the URL strategy.
     */
    effectiveRequestUrl?: string | URL | undefined;
};
import { strategy } from "./variables.js";
//# sourceMappingURL=extract-locale-from-request.d.ts.map