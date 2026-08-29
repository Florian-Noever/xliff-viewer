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
