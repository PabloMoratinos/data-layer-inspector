// Content script runs in an isolated world
// It acts as a bridge between the injected script (page context) and the DevTools panel

// 1. Inject the script immediately
(function () {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('src/injected_script.js');
    script.onload = function () {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
})();

// 2. Listen for messages from the injected script (Page -> Content)
window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data || event.data.source !== 'data-layer-inspector-injected') {
        return;
    }
    // Forward to Background -> DevTools
    try {
        chrome.runtime.sendMessage(event.data);
    } catch (e) {
        // Extension context invalidated usually happens on reload
        console.log('Data Layer Inspector: Could not send message, extension context invalidated?');
    }
});

// 3. Listen for messages from Background (DevTools -> Content)
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    // Forward to Injected Script (Content -> Page)
    window.postMessage({
        source: 'data-layer-inspector-content',
        ...request
    }, '*');
});
