let events = [];

// Connect to the background script or content script
// Since this is a devtools page, we need to establish a connection
const backgroundPageConnection = chrome.runtime.connect({
    name: "devtools-page"
});

backgroundPageConnection.postMessage({
    name: 'init',
    tabId: chrome.devtools.inspectedWindow.tabId
});

backgroundPageConnection.onMessage.addListener(function (message) {
    if (message.type === 'DATA_LAYER_EVENT') {
        addEvent(message.payload);
    } else if (message.type === 'DATA_LAYER_HISTORY') {
        // Initial load of history
        message.payload.forEach(addEvent);
    } else if (message.type === 'PAGE_NAVIGATION') {
        createGroup(message.payload.url);
    }
});

// Inject the content script if it hasn't been injected yet (or rely on manifest injection)
// For this architecture, we rely on the content script relaying messages.

// Initialize UI
const eventList = document.getElementById('eventList');
const expandAllBtn = document.getElementById('expandAll');
const collapseAllBtn = document.getElementById('collapseAll');
const clearBtn = document.getElementById('clear');
const exportBtn = document.getElementById('export');
const searchInput = document.getElementById('searchInput');

let currentGroup = null;
let currentGroupContent = null;

function createGroup(url) {
    // Deduplication: If the new URL is the same as the current group's URL, ignore
    // This handles frequent replaceState calls or duplicate events
    if (currentGroup && currentGroup.dataset.url === url) {
        return;
    }

    // Collapse previous group if exists
    if (currentGroup) {
        currentGroup.classList.add('collapsed');
    }

    const group = document.createElement('div');
    group.className = 'page-group';
    group.dataset.url = url; // Store URL for deduplication

    const header = document.createElement('div');
    header.className = 'page-group-header';
    header.innerHTML = `
        <span class="page-group-url" title="${url}">${url}</span>
        <span class="page-group-time">${new Date().toLocaleTimeString()}</span>
    `;

    const content = document.createElement('div');
    content.className = 'page-group-content';

    header.addEventListener('click', () => {
        group.classList.toggle('collapsed');
    });

    group.appendChild(header);
    group.appendChild(content);

    // Insert at the top of the list
    if (eventList.firstChild) {
        eventList.insertBefore(group, eventList.firstChild);
    } else {
        eventList.appendChild(group);
    }

    currentGroup = group;
    currentGroupContent = content;
}

function addEvent(eventData) {
    // Ensure we have a group
    if (!currentGroup) {
        // Fallback if no group created yet (shouldn't happen with init)
        // Try to get current URL or placeholder
        createGroup("Unknown Page");
    }

    // eventData should have { index, data, timestamp }
    events.unshift(eventData); // Global list for export/search
    renderEvent(eventData, currentGroupContent);
}

function renderEvent(event, container) {
    const item = document.createElement('div');
    item.className = 'event-item';
    item.dataset.id = event.index;

    const header = document.createElement('div');
    header.className = 'event-header';

    // Determine event name/type
    let eventName = 'Message';
    if (event.data && event.data.event) {
        eventName = event.data.event;
    } else if (event.data && typeof event.data === 'object') {
        eventName = Object.keys(event.data)[0] || 'Object';
    }

    header.innerHTML = `
        <span><span class="event-number">#${event.index}</span> <span class="event-type">${eventName}</span></span>
        <span class="event-time">${new Date(event.timestamp).toLocaleTimeString()}</span>
    `;

    const content = document.createElement('div');
    content.className = 'event-content';
    content.innerHTML = syntaxHighlight(event.data);

    header.addEventListener('click', () => {
        content.classList.toggle('expanded');
    });

    item.appendChild(header);
    item.appendChild(content);

    // Insert at the top of the group content
    if (container.firstChild) {
        container.insertBefore(item, container.firstChild);
    } else {
        container.appendChild(item);
    }
}

function syntaxHighlight(json) {
    if (typeof json !== 'string') {
        json = JSON.stringify(json, undefined, 2);
    }
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        var cls = 'json-number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'json-key';
            } else {
                if (match === '"__UNDEFINED__"') {
                    return '<span class="json-undefined">undefined</span>';
                }
                cls = 'json-string';
            }
        } else if (/true|false/.test(match)) {
            cls = 'json-boolean';
        } else if (/null/.test(match)) {
            cls = 'json-null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });
}

// Button Listeners
expandAllBtn.addEventListener('click', () => {
    document.querySelectorAll('.event-content').forEach(el => el.classList.add('expanded'));
    document.querySelectorAll('.page-group').forEach(el => el.classList.remove('collapsed'));
});

collapseAllBtn.addEventListener('click', () => {
    document.querySelectorAll('.event-content').forEach(el => el.classList.remove('expanded'));
    document.querySelectorAll('.page-group').forEach(el => el.classList.add('collapsed'));
});

clearBtn.addEventListener('click', () => {
    events = [];
    eventList.innerHTML = '';
    currentGroup = null;
    currentGroupContent = null;
    // Create a fresh group for the current page
    chrome.devtools.inspectedWindow.eval('window.location.href', (result, isException) => {
        createGroup(result || "Current Page");
    });
});

exportBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'datalayer-export.txt';
    a.click();
    URL.revokeObjectURL(url);
});

searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const items = document.querySelectorAll('.event-item');

    items.forEach(item => {
        const content = item.querySelector('.event-content').textContent.toLowerCase();
        const header = item.querySelector('.event-header').textContent.toLowerCase();
        if (content.includes(term) || header.includes(term)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
});

// Initialize
chrome.devtools.inspectedWindow.eval('window.location.href', (result, isException) => {
    createGroup(result || "Initial Page");

    // Request history on load
    backgroundPageConnection.postMessage({
        name: 'message',
        type: 'GET_HISTORY',
        tabId: chrome.devtools.inspectedWindow.tabId
    });
});

// Handle Navigation
chrome.devtools.network.onNavigated.addListener(function (url) {
    events = [];
    eventList.innerHTML = '';
    currentGroup = null; // Reset current group so createGroup works fresh
    // Create new group for new page
    createGroup(url);
    // Note: History might come in from re-injection.
    // If history comes, it will go into this new group.
});
