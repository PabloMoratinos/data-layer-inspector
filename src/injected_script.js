
// This script runs in the page context and has access to the global window object
(function () {
    // Prevent multiple injections
    if (window.__DATA_LAYER_INSPECTOR_INJECTED__) {
        console.log('Data Layer Inspector: Script already injected');
        return;
    }
    window.__DATA_LAYER_INSPECTOR_INJECTED__ = true;

    // Safe serializer to handle undefined and non-cloneable objects
    function safeSerialize(obj) {
        const seen = new WeakSet();
        return JSON.parse(JSON.stringify(obj, (key, value) => {
            if (value === undefined) return "__UNDEFINED__";
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) return "[Circular]";
                seen.add(value);
            }
            if (typeof value === 'function') return "[Function]";
            if (value instanceof HTMLElement) return "[HTMLElement]";
            return value;
        }));
    }

    // Helper to send messages to the content script
    function sendToContentScript(type, payload) {
        // We serialize the payload data to ensure undefined is preserved and no clone errors
        if (payload.data) {
            payload.data = safeSerialize(payload.data);
        }
        window.postMessage({
            source: 'data-layer-inspector-injected',
            type: type,
            payload: payload
        }, '*');
    }

    // Function to send history
    function sendHistory() {
        // Use the current global dataLayer if _dataLayer is not yet bound or if we want to be sure
        const currentData = window.dataLayer || _dataLayer || [];
        if (Array.isArray(currentData)) {
            currentData.forEach((item, index) => {
                sendToContentScript('DATA_LAYER_EVENT', {
                    index: index,
                    data: item,
                    timestamp: Date.now() // Approximate
                });
            });
        }
    }

    // Listen for commands from content script
    window.addEventListener('message', function (event) {
        if (event.source !== window || !event.data || event.data.source !== 'data-layer-inspector-content') {
            return;
        }
        if (event.data.type === 'GET_HISTORY') {
            // Clear panel first? Or just resend? 
            // The panel asks for history, so we send it.
            // But we should probably send a "CLEAR" signal or the panel handles it.
            // For now, just send history.
            sendHistory();
        }
    });

    // Hook push method
    function hookPush(arr) {
        if (!Array.isArray(arr)) return;
        if (arr.hasOwnProperty('push_hooked')) return;

        const originalPush = arr.push;
        Object.defineProperty(arr, 'push', {
            configurable: true,
            enumerable: false,
            writable: true,
            value: function (...args) {
                const result = originalPush.apply(this, args);
                args.forEach(item => {
                    sendToContentScript('DATA_LAYER_EVENT', {
                        index: this.length - 1,
                        data: item,
                        timestamp: Date.now()
                    });
                });
                return result;
            }
        });
        arr.push_hooked = true;
    }

    // Initial hook
    let _dataLayer = window.dataLayer || [];
    hookPush(_dataLayer);

    // Define getter/setter to catch reassignment
    try {
        const descriptor = Object.getOwnPropertyDescriptor(window, 'dataLayer');
        if (!descriptor || descriptor.configurable) {
            Object.defineProperty(window, 'dataLayer', {
                configurable: true,
                enumerable: true,
                get: function () {
                    return _dataLayer;
                },
                set: function (newValue) {
                    _dataLayer = newValue;
                    if (Array.isArray(_dataLayer)) {
                        hookPush(_dataLayer);
                        // Optional: Send a "RESET" or "REASSIGNED" event?
                        // Or just continue monitoring.
                        // If the user reassigns dataLayer = [], we might want to clear history or just show new events.
                        // For now, just hook the new array.
                    }
                }
            });
        } else {
            console.log('Data Layer Inspector: window.dataLayer is not configurable. Using polling for reassignment monitoring.');
            // Fallback: Poll for reassignment
            setInterval(() => {
                if (window.dataLayer !== _dataLayer) {
                    _dataLayer = window.dataLayer;
                    if (Array.isArray(_dataLayer)) {
                        hookPush(_dataLayer);
                    }
                }
            }, 1000);
        }
    } catch (e) {
        console.error('Data Layer Inspector: Error hooking window.dataLayer', e);
    }

    // Hook History API for SPA navigation detection
    function hookHistory() {
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        function notifyNavigation() {
            setTimeout(() => {
                sendToContentScript('PAGE_NAVIGATION', { url: window.location.href });
            }, 0);
        }

        history.pushState = function (...args) {
            const result = originalPushState.apply(this, args);
            notifyNavigation();
            return result;
        };

        history.replaceState = function (...args) {
            const result = originalReplaceState.apply(this, args);
            notifyNavigation();
            return result;
        };

        window.addEventListener('popstate', function () {
            notifyNavigation();
        });
    }

    hookHistory();

    // Capture existing dataLayer immediately
    if (Array.isArray(_dataLayer)) {
        sendHistory();
    }

})();

