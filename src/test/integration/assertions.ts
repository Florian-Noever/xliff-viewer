/**
 * Minimal assertions. `node:assert` is not available in the web host, and the
 * integration bundle must build for both.
 */

export function assertOk(value: unknown, message: string): asserts value {
    if (!value) {
        throw new Error(message);
    }
}

export function assertEqual<T>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
        throw new Error(`${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

export function assertArrayEqual(actual: readonly string[], expected: readonly string[], message: string): void {
    const same = actual.length === expected.length && actual.every((value, index) => value === expected[index]);
    if (!same) {
        throw new Error(`${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

export function assertContains(haystack: string, needle: string, message: string): void {
    if (!haystack.includes(needle)) {
        throw new Error(`${message} — ${JSON.stringify(needle)} not found`);
    }
}
