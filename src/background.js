// Background script to manage connections and relay messages

const connections = {};

chrome.runtime.onConnect.addListener(function (port) {
    const extensionListener = function (message, sender, sendResponse) {
        // The original connection event doesn't include the tab ID of the
        // DevTools page, so we need to send it explicitly.
        if (message.name == "init") {
            connections[message.tabId] = port;
            return;
        }

        // Forward other messages to the content script
        if (message.tabId) {
            chrome.tabs.sendMessage(message.tabId, message).catch(err => {
                // This can happen if the content script is not ready or the tab is closed
                // It's usually safe to ignore as the content script will request history when ready
                // console.debug('Data Layer Inspector: Could not send message to tab', err);
            });
        }
    };

    // Listen to messages sent from the DevTools page
    port.onMessage.addListener(extensionListener);

    port.onDisconnect.addListener(function (port) {
        port.onMessage.removeListener(extensionListener);

        const tabs = Object.keys(connections);
        for (var i = 0, len = tabs.length; i < len; i++) {
            if (connections[tabs[i]] == port) {
                delete connections[tabs[i]];
                break;
            }
        }
    });
});

// Receive message from content script and relay to the specific DevTools page for that tab
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    // Messages from content scripts should have sender.tab set
    if (sender.tab) {
        const tabId = sender.tab.id;
        if (tabId in connections) {
            connections[tabId].postMessage(request);
        } else {
            console.log("Tab not found in connection list.");
        }
    } else {
        console.log("sender.tab not defined.");
    }
    return true;
});
