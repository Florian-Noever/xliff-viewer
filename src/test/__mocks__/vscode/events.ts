/** Subscriptions and events, with a count of who still listens. */

export class Disposable {
    private readonly callback: () => void;

    public constructor(callback: () => void) {
        this.callback = callback;
    }

    public dispose(): void {
        this.callback();
    }
}

/** Every emitter made since the last reset, so a test can count who still listens. */
const emitters = new Set<{ readonly listenerCount: number }>();

export class EventEmitter<T> {
    private readonly listeners: ((value: T) => void)[] = [];

    public constructor() {
        emitters.add(this);
    }

    public get listenerCount(): number {
        return this.listeners.length;
    }

    public readonly event = (listener: (value: T) => void): Disposable => {
        this.listeners.push(listener);
        return new Disposable(() => {
            const index = this.listeners.indexOf(listener);
            if (index >= 0) {
                this.listeners.splice(index, 1);
            }
        });
    };

    public fire(value: T): void {
        for (const listener of [...this.listeners]) {
            listener(value);
        }
    }

    public dispose(): void {
        this.listeners.length = 0;
    }
}

/** How many listeners all event emitters hold between them — a disposal spy. */
export function emitterListenerCount(): number {
    let count = 0;
    for (const emitter of emitters) {
        count += emitter.listenerCount;
    }
    return count;
}

export function resetEvents(): void {
    emitters.clear();
}
