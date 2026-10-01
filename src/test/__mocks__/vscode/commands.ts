/** The `commands` namespace: the commands the extension ran, with their arguments. */

let executedCommands: { command: string; args: readonly unknown[] }[] = [];

export const commands = {
    executeCommand: (command: string, ...args: unknown[]): Promise<void> => {
        executedCommands.push({ command, args });
        return Promise.resolve();
    },
};

export function flushExecutedCommands(): { command: string; args: readonly unknown[] }[] {
    return executedCommands.splice(0);
}

export function resetCommands(): void {
    executedCommands = [];
}
