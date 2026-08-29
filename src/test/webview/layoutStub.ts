/**
 * jsdom lays nothing out: every element reports a zero size, so `@tanstack/vue-virtual`
 * sees a zero-height viewport and renders no rows at all. Any test that asserts on
 * rendered rows needs this, or it passes for the wrong reason.
 *
 * The virtualiser reads `offsetHeight` for the viewport and `getBoundingClientRect` when
 * measuring a row, so both are stubbed — the scroller gets a viewport's height and
 * everything else a row's.
 */

export const VIEWPORT_HEIGHT = 600;
export const STUB_ROW_HEIGHT = 24;

const SIZED = ['offsetHeight', 'offsetWidth', 'clientHeight', 'clientWidth'] as const;

/** Returns the function that puts jsdom back as it was. */
export function stubLayout(): () => void {
    const rect = Element.prototype.getBoundingClientRect;
    const saved = new Map<string, PropertyDescriptor | undefined>();
    const heightOf = (element: Element): number =>
        (element.classList.contains('scroller') ? VIEWPORT_HEIGHT : STUB_ROW_HEIGHT);

    for (const property of SIZED) {
        saved.set(property, Object.getOwnPropertyDescriptor(HTMLElement.prototype, property));
        Object.defineProperty(HTMLElement.prototype, property, {
            configurable: true,
            get(this: HTMLElement) {
                return property.endsWith('Width') ? 800 : heightOf(this);
            },
        });
    }

    Element.prototype.getBoundingClientRect = function fake(this: Element): DOMRect {
        return new DOMRect(0, 0, 800, heightOf(this));
    };

    return () => {
        Element.prototype.getBoundingClientRect = rect;
        for (const [property, descriptor] of saved) {
            if (descriptor === undefined) {
                delete (HTMLElement.prototype as unknown as Record<string, unknown>)[property];
            } else {
                Object.defineProperty(HTMLElement.prototype, property, descriptor);
            }
        }
    };
}
