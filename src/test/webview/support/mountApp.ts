import { mount } from '@vue/test-utils';

import App from '../../../webview/App.vue';
import { ExtensionMessageType } from '../../../shared/messages';

import type { XliffDocumentDto } from '../../../shared/dto';
import type { ExtensionMessage } from '../../../shared/messages';

/**
 * Delivers a message from the host at once. `window.postMessage` delivers it a task later,
 * which a test could only wait for with a real timer.
 */
export function receive(message: ExtensionMessage): void {
    window.dispatchEvent(new MessageEvent('message', { data: message }));
}

/**
 * Mounts the app on the page, so focus means something, and answers its `ready` with the
 * document, as the host does. Without one it waits, as it does before the host answers.
 */
export function mountApp(payload?: XliffDocumentDto) {
    const wrapper = mount(App, { attachTo: document.body });
    if (payload !== undefined) {
        receive({ type: ExtensionMessageType.setDocument, payload });
    }
    return wrapper;
}
