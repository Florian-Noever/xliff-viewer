/** How long one integration test may take, the same on both hosts. */
const TEST_TIMEOUT_MS = 20_000;

/** What both hosts configure Mocha with; each adds only what its own build needs. */
export const MOCHA_OPTIONS = { ui: 'tdd', timeout: TEST_TIMEOUT_MS } as const;

interface Runnable {
    run(callback: (failures: number) => void): unknown;
}

/** Shared promise wrapper around a configured Mocha instance. */
export function runMocha(mocha: Runnable): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            mocha.run(failures => {
                if (failures > 0) {
                    reject(new Error(`${failures} integration test(s) failed.`));
                    return;
                }
                resolve();
            });
        } catch (error: unknown) {
            reject(error instanceof Error ? error : new Error(String(error)));
        }
    });
}
