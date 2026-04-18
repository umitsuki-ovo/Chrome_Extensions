// Currency mappings

const SYMBOL_TO_CODE = {
    "A$": "AUD", "C$": "CAD", "HK$": "HKD", "S$": "SGD",
    "NZ$": "NZD", "NT$": "TWD",
    "$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY",
    "₩": "KRW", "₹": "INR", "₽": "RUB", "฿": "THB",
    "₺": "TRY", "R$": "BRL", "kr": "SEK",
};

// Longer entries must come before shorter ones (sorted below)
const WORD_TO_CODE = {
    "シンガポールドル": "SGD", "カナダドル": "CAD", "オーストラリアドル": "AUD",
    "ニュージーランドドル": "NZD", "香港ドル": "HKD", "スイスフラン": "CHF",
    "韓国ウォン": "KRW", "インドルピー": "INR", "台湾ドル": "TWD",
    "日本円": "JPY", "人民元": "CNY", "中国元": "CNY",
    "英ポンド": "GBP", "米ドル": "USD", "豪ドル": "AUD",
    "ルーブル": "RUB", "ルピー": "INR", "バーツ": "THB",
    "フラン": "CHF", "ユーロ": "EUR", "ポンド": "GBP",
    "ウォン": "KRW", "ドル": "USD", "元": "CNY", "円": "JPY",

    "australian dollar": "AUD", "canadian dollar": "CAD",
    "hong kong dollar": "HKD", "singapore dollar": "SGD",
    "new zealand dollar": "NZD",
    "swiss franc": "CHF",
    "renminbi": "CNY", "yuan": "CNY",
    "dollars": "USD", "dollar": "USD",
    "euros": "EUR", "euro": "EUR",
    "pounds": "GBP", "pound": "GBP",
    "rupees": "INR", "rupee": "INR",
    "francs": "CHF", "franc": "CHF",
    "rubles": "RUB", "ruble": "RUB",
    "baht": "THB",
    "won": "KRW",
    "yen": "JPY",
};

const ALL_CODES = [
    "USD","EUR","GBP","JPY","CNY","KRW","INR",
    "AUD","CAD","CHF","HKD","SGD","NZD","TWD",
    "THB","MXN","BRL","RUB","TRY","SEK","NOK","DKK","ZAR"
].join("|");

// Regex construction

// Symbol pattern — longer symbols must come first to avoid "$" eating "A$"
const symbolPat = Object.keys(SYMBOL_TO_CODE)
    .sort((a, b) => b.length - a.length)
    .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

// Word pattern — longer matches first
const wordPat = Object.keys(WORD_TO_CODE)
    .sort((a, b) => b.length - a.length)
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

const numPat   = "\\d{1,3}(?:[,，]\\d{3})*(?:\\.\\d+)?";
const jpUnit   = "[万億兆]";

// Match groups:
//   [1] symbol   [2] amount-after-symbol
//   [3] amount   [4] currency-code   [5] currency-word
const CURRENCY_RE = new RegExp(
    `(${symbolPat})\\s?(${numPat}(?:\\s?${jpUnit})?)|` +
    `(${numPat}(?:\\s?${jpUnit})?)\\s?(?:(${ALL_CODES})|(${wordPat}))`,
    "g"
);

// Helpers

function parseAmount(str) {
    const clean = str.replace(/[,，]/g, "").trim();
    const jpMatch = clean.match(/^([\d.]+)\s*([万億兆])$/);
    if (jpMatch) {
        const mults = { "万": 1e4, "億": 1e8, "兆": 1e12 };
        return parseFloat(jpMatch[1]) * mults[jpMatch[2]];
    }
    return parseFloat(clean);
}

function formatNumber(num) {
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Extension context guard
// When the extension is reloaded/updated, chrome.runtime becomes invalid.

let contextAlive = true;

function isAlive() {
    try {
        // Accessing chrome.runtime.id throws if context is gone
        return contextAlive && !!chrome.runtime?.id;
    } catch {
        contextAlive = false;
        return false;
    }
}

// Called whenever we detect context loss — stops the MutationObserver
let stopObserver = () => {};

function handleContextLost() {
    contextAlive = false;
    stopObserver();
    console.info("[CurrencyConverter] Extension reloaded — converter stopped.");
}

// Settings

let settings = { enabled: true, target: "JPY" };

try {
    chrome.storage.sync.get(["enabled", "target"], (data) => {
        if (chrome.runtime.lastError) return; // context gone between call and callback
        settings.enabled = data.enabled ?? true;
        settings.target  = data.target  ?? "JPY";
        init();
    });
} catch (e) {
    handleContextLost();
}

try {
    chrome.storage.onChanged.addListener((changes) => {
        if (!isAlive()) return;
        if (changes.enabled !== undefined) settings.enabled = changes.enabled.newValue;
        if (changes.target  !== undefined) settings.target  = changes.target.newValue;
    });
} catch (e) {
    handleContextLost();
}

// Rate fetching

function getRates() {
    return new Promise((resolve) => {
        if (!isAlive()) { resolve(null); return; }
        try {
            chrome.runtime.sendMessage({ type: "GET_RATES" }, (rates) => {
                if (chrome.runtime.lastError) {
                    handleContextLost();
                    resolve(null);
                    return;
                }
                resolve(rates);
            });
        } catch (e) {
            handleContextLost();
            resolve(null);
        }
    });
}

// Node processing

// Track already-converted nodes to prevent duplicate conversion
const processed = new WeakSet();

async function processNode(node, rates) {
    if (processed.has(node)) return;
    const original = node.nodeValue;
    if (!original || !original.trim()) return;
    // Skip if this node already contains a conversion annotation
    if (original.includes("(≈")) return;

    CURRENCY_RE.lastIndex = 0;
    const replaced = original.replace(CURRENCY_RE, (match, sym, amtSym, amtPre, code, word) => {
        let currency, amountStr;

        if (sym && amtSym) {
            // Symbol-prefixed: $100, €50
            currency   = SYMBOL_TO_CODE[sym];
            amountStr  = amtSym;
        } else if (amtPre && (code || word)) {
            // Number followed by code or word: 100 USD, 100ドル
            currency   = code || WORD_TO_CODE[word.toLowerCase()] || WORD_TO_CODE[word];
            amountStr  = amtPre;
        } else {
            return match;
        }

        if (!currency || currency === settings.target) return match;
        if (!rates[currency] || !rates[settings.target]) return match;

        const value     = parseAmount(amountStr);
        const usdValue  = currency === "USD" ? value : value / rates[currency];
        const converted = usdValue * rates[settings.target];

        return `${match} (≈\u202F${settings.target}\u00A0${formatNumber(converted)})`;
    });

    if (replaced !== original) {
        processed.add(node);
        node.nodeValue = replaced;
    }
}

// Page scan

async function scanNodes(root, rates) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes  = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (const node of nodes) await processNode(node, rates);
}

async function scanPage() {
    if (!settings.enabled || !isAlive()) return;
    const rates = await getRates();
    if (!rates) return;
    await scanNodes(document.body, rates);
}

// MutationObserver
// Only process *newly added* nodes — never re-scan the whole page.

function observe() {
    const observer = new MutationObserver((mutations) => {
        if (!settings.enabled || !isAlive()) {
            observer.disconnect();
            return;
        }
        getRates().then((rates) => {
            if (!rates) return;
            for (const mut of mutations) {
                for (const added of mut.addedNodes) {
                    if (added.nodeType === Node.TEXT_NODE) {
                        processNode(added, rates);
                    } else if (added.nodeType === Node.ELEMENT_NODE) {
                        scanNodes(added, rates);
                    }
                }
            }
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    stopObserver = () => observer.disconnect();
}

// Init

async function init() {
    await scanPage();
    observe();
}
