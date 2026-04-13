const currencySymbols = {
    "$": "USD",
    "€": "EUR",
    "£": "GBP",
    "¥": "JPY"
};

let settings = {
    enabled: true,
    target: "JPY"
};

// Load settings
chrome.storage.sync.get(["enabled", "target"], (data) => {
    settings.enabled = data.enabled ?? true;
    settings.target = data.target ?? "JPY";
    init();
});

function getRates() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "GET_RATES" }, resolve);
    });
}

const regex = /(?:(\$|€|£|¥)\s?|(?:USD|EUR|GBP|JPY)\s?)?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)(?:\s?(USD|EUR|GBP|JPY))?/g;

function detectCurrency(symbol, code) {
    if (code) return code;
    if (symbol) return currencySymbols[symbol];
    return null;
}

function formatNumber(num) {
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

async function processNode(node, rates) {
    if (!node.nodeValue.trim()) return;

    let text = node.nodeValue;

    const replaced = text.replace(regex, (match, symbol, amount, code) => {
        const currency = detectCurrency(symbol, code);
        if (!currency) return match;

        const value = parseFloat(amount.replace(/,/g, ""));
        if (!rates[currency] || !rates[settings.target]) return match;

        // USD-based conversion
        const usdValue = currency === "USD" ? value : value / rates[currency];
        const converted = usdValue * rates[settings.target];

        return `${match} (≈ ${settings.target} ${formatNumber(converted)})`;
    });

    if (text !== replaced) {
        node.nodeValue = replaced;
    }
}

async function scanPage() {
    if (!settings.enabled) return;

    const rates = await getRates();

    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT
    );

    let node;
    while (node = walker.nextNode()) {
        processNode(node, rates);
    }
}

// MutationObserver
function observe(rates) {
    const observer = new MutationObserver(() => scanPage());
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

async function init() {
    const rates = await getRates();
    await scanPage();
    observe(rates);
}