// ==UserScript==
// @name         TokeniZer
// @namespace    https://github.com/YOUR_USERNAME/tokenizer
// @version      1.0.0
// @description  Token count, cache timer, session and weekly usage bars on claude.ai
// @author       Soumik Majumder
// @match        https://claude.ai/*
// @run-at       document-start
// @grant        none
// @require      https://unpkg.com/gpt-tokenizer@2.9.0/dist/o200k_base.js
// ==/UserScript==

(() => {
    'use strict';

    // ==========================================
    // 1. CSS INJECTION
    // ==========================================
    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
/* TokeniZer widget styles */
.tz-widget {
	position: fixed;
	right: 18px;
	bottom: 18px;
	width: 260px;
	background: linear-gradient(180deg, #0e0e10 0%, #151415 100%);
	color: #e8e6e4;
	border-radius: 12px;
	box-shadow: 0 6px 30px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.02) inset;
	border: 1px solid rgba(255,140,0,0.06);
	font-family: Inter, system-ui, -apple-system, Arial, sans-serif;
	z-index: 2147483647;
	overflow: hidden;
	transition: width 180ms ease, border-radius 180ms ease, transform 180ms ease, box-shadow 180ms ease;
}

.tz-header {
	display: flex;
	align-items: center;
	gap: 8px;
	justify-content: space-between;
	padding: 10px 12px;
	background: linear-gradient(90deg, rgba(255,140,0,0.06), transparent);
	border-bottom: 1px solid rgba(255,255,255,0.02);
}

.tz-title {
	font-weight: 700;
	letter-spacing: 1px;
	color: #ff8c00;
	font-size: 13px;
	flex: 0 0 auto;
}

.tz-compact-status {
	margin-left: auto;
	font-size: 12px;
	color: #d6d3d0;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	min-width: 0;
}

.tz-collapse-btn {
	flex: 0 0 auto;
	width: 24px;
	height: 24px;
	padding: 0;
	border: 1px solid rgba(255,255,255,0.08);
	border-radius: 999px;
	background: rgba(255,255,255,0.04);
	color: #e8e6e4;
	font: inherit;
	line-height: 1;
	cursor: pointer;
	transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
}

.tz-collapse-btn:hover {
	background: rgba(255,140,0,0.14);
	border-color: rgba(255,140,0,0.28);
	transform: translateY(-1px);
}

.tz-body {
	padding: 12px;
	display: grid;
	gap: 10px;
}

.tz-section-label {
	font-size: 11px;
	color: #bdb9b6;
}

.tz-context {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.tz-token-count {
	font-weight: 700;
	color: #ffffff;
}

.tz-cache {
	font-size: 12px;
	color: #bdb9b6;
}

.tz-usage-row {
	display: flex;
	align-items: center;
	gap: 8px;
}

.tz-usage-meta {
	font-size: 11px;
	line-height: 1.3;
	color: #bdb9b6;
	margin-top: -2px;
	padding-left: 2px;
}

.tz-bar {
	--radius: 6px;
	background: rgba(255,255,255,0.04);
	border-radius: var(--radius);
	height: 10px;
	flex: 1;
	overflow: hidden;
	border: 1px solid rgba(255,255,255,0.02);
}

.tz-bar__fill {
	height: 100%;
	width: 0%;
	background: linear-gradient(90deg, #ff8c00, #ffb66b);
	transition: width 400ms ease, background-color 200ms ease;
}

.tz-usage-label {
	font-size: 12px;
	min-width: 60px;
	color: #d6d3d0;
}

.tz-footer {
	padding: 8px 12px;
	border-top: 1px solid rgba(255,255,255,0.02);
	font-size: 11px;
	color: #9d9a98;
}

.tz-widget--collapsed {
	width: auto;
	min-width: 220px;
	border-radius: 999px;
	box-shadow: 0 10px 28px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.02) inset;
}

.tz-widget--collapsed .tz-header {
	padding: 8px 10px;
	border-bottom: 0;
	background: linear-gradient(90deg, rgba(255,140,0,0.08), rgba(255,255,255,0.01));
}

.tz-widget--collapsed .tz-body,
.tz-widget--collapsed .tz-footer {
	display: none;
}

.tz-widget--collapsed .tz-compact-status {
	max-width: 150px;
}

/* Small helpers */
.tz-muted { color: #9d9a98; }
.tz-hidden { display: none !important; }

/* Keep legacy classes to avoid breaking other scripts */
.cc-hidden { display: none !important; }
.cc-bar { }
.cc-bar__fill { }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    if (document.head) {
        injectStyles();
    } else {
        const observer = new MutationObserver(() => {
            if (document.head) {
                injectStyles();
                observer.disconnect();
            }
        });
        observer.observe(document.documentElement, { childList: true });
    }

    // ==========================================
    // 2. bridge.js (FETCH INTERCEPTION)
    // ==========================================
    const CC_MARKER = 'ClaudeCounter';
    const originalFetch = window.fetch;
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    history.pushState = function (...args) {
        const result = originalPushState(...args);
        window.dispatchEvent(new CustomEvent('cc:urlchange'));
        return result;
    };

    history.replaceState = function (...args) {
        const result = originalReplaceState(...args);
        window.dispatchEvent(new CustomEvent('cc:urlchange'));
        return result;
    };

    window.fetch = async (...args) => {
        const input = args[0];
        const url = toAbsoluteUrl(input);
        const opts = args[1] || {};

        let method = opts.method;
        if (!method && input instanceof Request) {
            method = input.method;
        }

        if (url && method === 'POST' && (url.includes('/completion') || url.includes('/retry_completion'))) {
            post('cc:generation_start', {});
        }

        const response = await originalFetch.apply(window, args);
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('event-stream')) {
            handleEventStream(response);
        }

        if (url && url.includes('/chat_conversations/') && url.includes('tree=')) {
            const meta = getConversationMeta(url);
            if (meta) {
                handleConversationResponse(meta, response);
            }
        }

        return response;
    };

    function post(type, payload) {
        window.postMessage({ cc: CC_MARKER, type, payload }, '*');
    }

    function postResponse(requestId, ok, payload, error) {
        window.postMessage({ cc: CC_MARKER, type: 'cc:response', requestId, ok, payload, error }, '*');
    }

    function toAbsoluteUrl(input) {
        if (typeof input === 'string') {
            if (input.startsWith('/')) return `https://claude.ai${input}`;
            return input;
        }
        if (input instanceof URL) return input.href;
        if (input instanceof Request) return input.url;
        return '';
    }

    function getConversationMeta(url) {
        const match = url.match(/^https:\/\/claude\.ai\/api\/organizations\/([^/]+)\/chat_conversations\/([^/?]+)/);
        return match ? { orgId: match[1], conversationId: match[2] } : null;
    }

    async function handleConversationResponse({ orgId, conversationId }, response) {
        try {
            const cloned = response.clone();
            const data = await cloned.json();
            post('cc:conversation', { orgId, conversationId, data });
        } catch { /* ignore */ }
    }

    async function handleEventStream(response) {
        try {
            const cloned = response.clone();
            const reader = cloned.body?.getReader?.();
            if (!reader) return;
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split(/\r\n|\r|\n/);
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.startsWith('data:')) continue;
                    const raw = line.slice(5).trim();
                    if (!raw) continue;
                    try {
                        const json = JSON.parse(raw);
                        if (json?.type === 'message_limit' && json.message_limit) {
                            post('cc:message_limit', json.message_limit);
                        }
                    } catch { /* ignore */ }
                }
            }
        } catch { /* best-effort */ }
    }

    window.addEventListener('message', async (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.cc !== CC_MARKER) return;
        if (data.type !== 'cc:request') return;

        const { requestId, kind, payload } = data;
        try {
            if (kind === 'hash') {
                const text = typeof payload?.text === 'string' ? payload.text : '';
                if (!text || !crypto?.subtle?.digest) {
                    postResponse(requestId, false, null, 'Hash unavailable');
                    return;
                }
                const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
                const bytes = new Uint8Array(buffer);
                const hash = Array.from(bytes.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
                postResponse(requestId, true, { hash }, null);
                return;
            }

            if (kind === 'usage') {
                const orgId = payload?.orgId;
                if (!orgId) throw new Error('Missing orgId');
                const res = await originalFetch(`https://claude.ai/api/organizations/${orgId}/usage`, {
                    method: 'GET',
                    credentials: 'include'
                });
                const json = await res.json();
                postResponse(requestId, true, json, null);
                return;
            }

            if (kind === 'conversation') {
                const orgId = payload?.orgId;
                const conversationId = payload?.conversationId;
                if (!orgId || !conversationId) throw new Error('Missing orgId/conversationId');

                const url = `https://claude.ai/api/organizations/${orgId}/chat_conversations/${conversationId}?tree=true&rendering_mode=messages&render_all_tools=true`;
                const res = await originalFetch(url, {
                    method: 'GET',
                    credentials: 'include'
                });
                const json = await res.json();
                post('cc:conversation', { orgId, conversationId, data: json });
                postResponse(requestId, true, json, null);
                return;
            }

            throw new Error(`Unknown request kind: ${kind}`);
        } catch (e) {
            postResponse(requestId, false, null, e?.message || String(e));
        }
    });

    // ==========================================
    // 3. constants.js
    // ==========================================
    const CC = (globalThis.ClaudeCounter = globalThis.ClaudeCounter || {});

    CC.DOM = Object.freeze({
        CHAT_MENU_TRIGGER: '[data-testid="chat-menu-trigger"]',
        MODEL_SELECTOR_DROPDOWN: '[data-testid="model-selector-dropdown"]',
        CHAT_PROJECT_WRAPPER: '.chat-project-wrapper',
        BRIDGE_SCRIPT_ID: 'cc-bridge-script'
    });

    CC.CONST = Object.freeze({
        CACHE_WINDOW_MS: 5 * 60 * 1000,
        CONTEXT_LIMIT_TOKENS: 200000
    });

    CC.COLORS = Object.freeze({
        PROGRESS_FILL_DARK: '#2c84db',
        PROGRESS_FILL_LIGHT: '#5aa6ff',
        PROGRESS_OUTLINE_DARK: '#787877',
        PROGRESS_OUTLINE_LIGHT: '#bfbfbf',
        PROGRESS_MARKER_DARK: '#ffffff',
        PROGRESS_MARKER_LIGHT: '#111111',
        RED_WARNING: '#ce2029',
        BOLD_LIGHT: '#141413',
        BOLD_DARK: '#faf9f5'
    });

    // ==========================================
    // 4. bridge-client.js
    // ==========================================
    function makeRequestId() {
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    class BridgeClient {
        constructor() {
            this._pending = new Map();
            this._listeners = new Map();

            window.addEventListener('message', (event) => {
                if (event.source !== window) return;
                const data = event.data;
                if (!data || data.cc !== 'ClaudeCounter') return;

                if (data.type === 'cc:response') {
                    const { requestId, ok, payload, error } = data;
                    const pending = this._pending.get(requestId);
                    if (!pending) return;
                    this._pending.delete(requestId);
                    clearTimeout(pending.timeoutId);
                    if (ok) pending.resolve(payload);
                    else pending.reject(new Error(error || 'Bridge request failed'));
                    return;
                }

                this._emit(data.type, data.payload);
            });
        }

        _emit(type, payload) {
            const listeners = this._listeners.get(type);
            if (!listeners) return;
            for (const fn of listeners) { fn(payload); }
        }

        on(type, fn) {
            if (!this._listeners.has(type)) this._listeners.set(type, new Set());
            this._listeners.get(type).add(fn);
            return () => this._listeners.get(type)?.delete(fn);
        }

        request(kind, payload, { timeoutMs = 10000 } = {}) {
            const requestId = makeRequestId();
            return new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    this._pending.delete(requestId);
                    reject(new Error(`Bridge request timed out (${kind})`));
                }, timeoutMs);

                this._pending.set(requestId, { resolve, reject, timeoutId });
                window.postMessage({ cc: 'ClaudeCounter', type: 'cc:request', requestId, kind, payload }, '*');
            });
        }

        async requestUsage(orgId) { return this.request('usage', { orgId }, { timeoutMs: 15000 }); }
        async requestConversation(orgId, conversationId) { return this.request('conversation', { orgId, conversationId }, { timeoutMs: 20000 }); }
        async requestHash(text) { return this.request('hash', { text }, { timeoutMs: 5000 }); }
    }

    // Modified for userscript: bridge is already inlined
    function injectBridgeOnce() {
        return Promise.resolve(true);
    }

    CC.bridge = new BridgeClient();
    CC.injectBridgeOnce = injectBridgeOnce;

    // ==========================================
    // 5. tokens.js
    // ==========================================
    const ROOT_MESSAGE_ID = '00000000-0000-4000-8000-000000000000';

    function stableStringify(value) {
        const seen = new WeakSet();
        const normalize = (v) => {
            if (v === null || typeof v !== 'object') return v;
            if (seen.has(v)) return '[Circular]';
            seen.add(v);
            if (Array.isArray(v)) return v.map(normalize);
            const out = {};
            for (const key of Object.keys(v).sort()) { out[key] = normalize(v[key]); }
            return out;
        };
        try { return JSON.stringify(normalize(value)); } catch { return ''; }
    }

    function getTokenizer() {
        return globalThis.GPTTokenizer_o200k_base || null;
    }

    function countTokens(text) {
        if (!text) return 0;
        const tokenizer = getTokenizer();
        if (!tokenizer?.countTokens) return 0;
        try { return tokenizer.countTokens(text); } catch { return 0; }
    }

    function buildTrunk(conversation) {
        const messages = Array.isArray(conversation?.chat_messages) ? conversation.chat_messages : [];
        const byId = new Map();
        for (const msg of messages) { if (msg?.uuid) byId.set(msg.uuid, msg); }
        const leaf = conversation?.current_leaf_message_uuid;
        if (!leaf) return [];
        const trunk = [];
        let currentId = leaf;
        while (currentId && currentId !== ROOT_MESSAGE_ID) {
            const msg = byId.get(currentId);
            if (!msg) break;
            trunk.push(msg);
            currentId = msg.parent_message_uuid;
        }
        trunk.reverse();
        return trunk;
    }

    function isCountableContentItem(item) {
        if (!item || typeof item !== 'object') return false;
        if (typeof item.type !== 'string') return false;
        if (item.type === 'thinking' || item.type === 'redacted_thinking') return false;
        if (item.type === 'image' || item.type === 'document') return false;
        return true;
    }

    function stringifyCountableContentItem(item) {
        if (!isCountableContentItem(item)) return '';
        if (item.type === 'text' && typeof item.text === 'string') return item.text;
        if (item.type === 'tool_use') {
            const minimal = { id: item.id, name: item.name, input: item.input };
            return stableStringify(minimal);
        }
        if (item.type === 'tool_result') {
            const minimal = { tool_use_id: item.tool_use_id, is_error: item.is_error, content: item.content };
            return stableStringify(minimal);
        }
        const minimal = {};
        if (typeof item.text === 'string') minimal.text = item.text;
        if (typeof item.title === 'string') minimal.title = item.title;
        if (typeof item.url === 'string') minimal.url = item.url;
        if (typeof item.content === 'string') minimal.content = item.content;
        if (Array.isArray(item.content)) minimal.content = item.content;
        if (Object.keys(minimal).length === 0) return '';
        return stableStringify(minimal);
    }

    function stringifyMessageCountables(message) {
        const parts = [];
        const content = Array.isArray(message?.content) ? message.content : [];
        for (const item of content) {
            const s = stringifyCountableContentItem(item);
            if (s) parts.push(s);
        }
        const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
        for (const a of attachments) {
            if (typeof a?.extracted_content === 'string' && a.extracted_content) {
                parts.push(a.extracted_content);
            }
        }
        return parts.join('\n');
    }

    async function hashString(str) {
        if (!CC.bridge?.requestHash) return null;
        try {
            const res = await CC.bridge.requestHash(str);
            if (res?.hash) return res.hash;
        } catch { }
        return null;
    }

    async function fingerprint(text) {
        if (!text) return null;
        const hash = await hashString(text);
        if (!hash) return null;
        return `${text.length}:${hash}`;
    }

    class TokenCache {
        constructor() { this._byMessageId = new Map(); }
        async getMessageTokens(messageId, messageText) {
            const fp = await fingerprint(messageText);
            if (!fp) return countTokens(messageText);
            const cached = this._byMessageId.get(messageId);
            if (cached && cached.fp === fp) return cached.tokens;
            const tokens = countTokens(messageText);
            this._byMessageId.set(messageId, { fp, tokens });
            return tokens;
        }
        pruneToMessageIds(keepIds) {
            const keep = new Set(keepIds);
            for (const id of this._byMessageId.keys()) { if (!keep.has(id)) this._byMessageId.delete(id); }
        }
    }

    const tokenCache = new TokenCache();

    async function computeConversationMetrics(conversation) {
        const trunk = buildTrunk(conversation);
        const trunkIds = trunk.map((m) => m.uuid).filter(Boolean);
        tokenCache.pruneToMessageIds(trunkIds);

        let totalTokens = 0;
        let lastAssistantMs = null;

        for (const msg of trunk) {
            if (msg?.sender === 'assistant' && msg?.created_at) {
                const msgMs = Date.parse(msg.created_at);
                if (!lastAssistantMs || msgMs > lastAssistantMs) { lastAssistantMs = msgMs; }
            }
            const msgText = stringifyMessageCountables(msg);
            const msgTokens = msg?.uuid ? await tokenCache.getMessageTokens(msg.uuid, msgText) : countTokens(msgText);
            totalTokens += msgTokens;
        }
        const cachedUntil = lastAssistantMs ? lastAssistantMs + CC.CONST.CACHE_WINDOW_MS : null;
        return { trunkMessageCount: trunk.length, totalTokens, lastAssistantMs, cachedUntil };
    }

    CC.tokens = { computeConversationMetrics };

    // ==========================================
    // 6. ui.js
    // ==========================================
    function formatSeconds(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }

    function formatResetCountdown(timestampMs) {
        const diffMs = timestampMs - Date.now();
        if (diffMs <= 0) return '0m';
        const totalMinutes = Math.round(diffMs / (1000 * 60));
        if (totalMinutes < 60) return `${totalMinutes}m`;
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        if (hours < 24) return `${hours}h ${minutes}m`;
        const days = Math.floor(hours / 24);
        const remHours = hours % 24;
        return `${days}d ${remHours}h`;
    }

    function setupTooltip(element, tooltip, { topOffset = 10 } = {}) {
        if (!element || !tooltip) return;
        if (element.hasAttribute('data-tooltip-setup')) return;
        element.setAttribute('data-tooltip-setup', 'true');
        element.classList.add('cc-tooltipTrigger');
        let pressTimer;
        let hideTimer;
        const show = () => {
            const rect = element.getBoundingClientRect();
            tooltip.style.opacity = '1';
            const tipRect = tooltip.getBoundingClientRect();
            let left = rect.left + rect.width / 2;
            if (left + tipRect.width / 2 > window.innerWidth) left = window.innerWidth - tipRect.width / 2 - 10;
            if (left - tipRect.width / 2 < 0) left = tipRect.width / 2 + 10;
            let top = rect.top - tipRect.height - topOffset;
            if (top < 10) top = rect.bottom + 10;
            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;
            tooltip.style.transform = 'translateX(-50%)';
        };
        const hide = () => { tooltip.style.opacity = '0'; clearTimeout(hideTimer); };
        element.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch' || e.pointerType === 'pen') {
                pressTimer = setTimeout(() => { show(); hideTimer = setTimeout(hide, 3000); }, 500);
            }
        });
        element.addEventListener('pointerup', () => clearTimeout(pressTimer));
        element.addEventListener('pointercancel', () => { clearTimeout(pressTimer); hide(); });
        element.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(); });
        element.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    }

    function makeTooltip(text) {
        const tip = document.createElement('div');
        tip.className = 'bg-bg-500 text-text-000 cc-tooltip';
        tip.textContent = text;
        document.body.appendChild(tip);
        return tip;
    }

    function formatUsageCopy(percent, resetMs) {
        const pctText = typeof percent === 'number' ? `${Math.round(Math.max(0, Math.min(100, percent)))}%` : '--';
        if (!resetMs) return `${pctText} - reset unknown`;
        return `${pctText} - resets in ${formatResetCountdown(resetMs)}`;
    }

    function formatContextCopy(totalTokens) {
        if (typeof totalTokens !== 'number') return '';
        return `~${totalTokens.toLocaleString()} / 200k tokens`;
    }

    class CounterUI {
        constructor({ onUsageRefresh } = {}) {
            this.onUsageRefresh = onUsageRefresh || null;
            this.storageKey = 'tokenizer.widgetCollapsed';
            this.widget = null;
            this.headerEl = null;
            this.bodyEl = null;
            this.footerEl = null;
            this.minimizeButton = null;
            this.compactTextEl = null;
            this.tokenCountEl = null;
            this.cacheEl = null;
            this.sessionMetaEl = null;
            this.weeklyMetaEl = null;
            this.sessionBarFill = null;
            this.weeklyBarFill = null;
            this.sessionPct = null;
            this.weeklyPct = null;
            this.sessionResetMs = null;
            this.weeklyResetMs = null;
            this.isCollapsed = false;
            this.lastCachedUntilMs = null;
        }

        initialize() {
            this.widget = document.createElement('div');
            this.widget.className = 'tz-widget';
            this.isCollapsed = localStorage.getItem(this.storageKey) === '1';
            this.widget.classList.toggle('tz-widget--collapsed', this.isCollapsed);

            this.headerEl = document.createElement('div');
            this.headerEl.className = 'tz-header';
            const title = document.createElement('div');
            title.className = 'tz-title';
            title.textContent = 'TOKENIZER';
            this.compactTextEl = document.createElement('div');
            this.compactTextEl.className = 'tz-compact-status';
            this.minimizeButton = document.createElement('button');
            this.minimizeButton.type = 'button';
            this.minimizeButton.className = 'tz-collapse-btn';
            this.headerEl.appendChild(title);
            this.headerEl.appendChild(this.compactTextEl);
            this.headerEl.appendChild(this.minimizeButton);

            this.bodyEl = document.createElement('div');
            this.bodyEl.className = 'tz-body';

            const ctxLabel = document.createElement('div');
            ctxLabel.className = 'tz-section-label';
            ctxLabel.textContent = 'CONTEXT WINDOW';
            this.bodyEl.appendChild(ctxLabel);

            const ctxRow = document.createElement('div');
            ctxRow.className = 'tz-context';
            this.tokenCountEl = document.createElement('div');
            this.tokenCountEl.className = 'tz-token-count';
            this.tokenCountEl.textContent = '~0 tokens';
            this.cacheEl = document.createElement('div');
            this.cacheEl.className = 'tz-cache';
            this.cacheEl.textContent = '';
            ctxRow.appendChild(this.tokenCountEl);
            ctxRow.appendChild(this.cacheEl);
            this.bodyEl.appendChild(ctxRow);

            const sessionLabel = document.createElement('div');
            sessionLabel.className = 'tz-section-label';
            sessionLabel.textContent = 'SESSION';
            this.bodyEl.appendChild(sessionLabel);

            const sessionRow = document.createElement('div');
            sessionRow.className = 'tz-usage-row';
            const sessionText = document.createElement('div');
            sessionText.className = 'tz-usage-label tz-muted';
            sessionText.textContent = 'Usage';
            const sessionBar = document.createElement('div');
            sessionBar.className = 'tz-bar';
            this.sessionBarFill = document.createElement('div');
            this.sessionBarFill.className = 'tz-bar__fill';
            sessionBar.appendChild(this.sessionBarFill);
            sessionRow.appendChild(sessionText);
            sessionRow.appendChild(sessionBar);
            this.sessionMetaEl = document.createElement('div');
            this.sessionMetaEl.className = 'tz-usage-meta';
            this.bodyEl.appendChild(sessionRow);
            this.bodyEl.appendChild(this.sessionMetaEl);

            const weeklyLabel = document.createElement('div');
            weeklyLabel.className = 'tz-section-label';
            weeklyLabel.textContent = 'WEEKLY';
            this.bodyEl.appendChild(weeklyLabel);

            const weeklyRow = document.createElement('div');
            weeklyRow.className = 'tz-usage-row';
            const weeklyText = document.createElement('div');
            weeklyText.className = 'tz-usage-label tz-muted';
            weeklyText.textContent = 'Usage';
            const weeklyBar = document.createElement('div');
            weeklyBar.className = 'tz-bar';
            this.weeklyBarFill = document.createElement('div');
            this.weeklyBarFill.className = 'tz-bar__fill';
            weeklyBar.appendChild(this.weeklyBarFill);
            weeklyRow.appendChild(weeklyText);
            weeklyRow.appendChild(weeklyBar);
            this.weeklyMetaEl = document.createElement('div');
            this.weeklyMetaEl.className = 'tz-usage-meta';
            this.bodyEl.appendChild(weeklyRow);
            this.bodyEl.appendChild(this.weeklyMetaEl);

            this.footerEl = document.createElement('div');
            this.footerEl.className = 'tz-footer';
            this.footerEl.textContent = 'TokeniZer — approximate counts';

            this.widget.appendChild(this.headerEl);
            this.widget.appendChild(this.bodyEl);
            this.widget.appendChild(this.footerEl);
            document.body.appendChild(this.widget);

            this.minimizeButton.addEventListener('click', () => { this.setCollapsed(!this.isCollapsed); });
            this.setCollapsed(this.isCollapsed);
        }

        setCollapsed(collapsed) {
            this.isCollapsed = !!collapsed;
            this.widget.classList.toggle('tz-widget--collapsed', this.isCollapsed);
            this.bodyEl.hidden = this.isCollapsed;
            this.footerEl.hidden = this.isCollapsed;
            this.minimizeButton.textContent = this.isCollapsed ? '+' : '–';
            this.minimizeButton.setAttribute('aria-label', this.isCollapsed ? 'Expand widget' : 'Minimize widget');
            localStorage.setItem(this.storageKey, this.isCollapsed ? '1' : '0');
            this.updateUsageDisplay();
            this.updateCompactText();
        }

        updateCompactText() {
            if (!this.compactTextEl) return;
            if (this.isCollapsed) {
                const sessionText = typeof this.sessionPct === 'number' ? `Session ${Math.round(this.sessionPct)}%` : 'Session --';
                const resetText = this.sessionResetMs ? `reset in ${formatResetCountdown(this.sessionResetMs)}` : 'reset unknown';
                this.compactTextEl.textContent = `${sessionText} - ${resetText}`;
                return;
            }
            this.compactTextEl.textContent = this.tokenCountEl?.textContent || '';
        }

        updateUsageDisplay() {
            if (this.sessionMetaEl) this.sessionMetaEl.textContent = formatUsageCopy(this.sessionPct, this.sessionResetMs);
            if (this.weeklyMetaEl) this.weeklyMetaEl.textContent = formatUsageCopy(this.weeklyPct, this.weeklyResetMs);
        }

        setConversationMetrics({ totalTokens, cachedUntil } = {}) {
            if (typeof totalTokens !== 'number') {
                this.tokenCountEl.textContent = '';
                this.cacheEl.textContent = '';
                this.lastCachedUntilMs = null;
                this.updateCompactText();
                return;
            }
            this.tokenCountEl.textContent = formatContextCopy(totalTokens);
            this.updateCompactText();
            const now = Date.now();
            if (typeof cachedUntil === 'number' && cachedUntil > now) {
                this.lastCachedUntilMs = cachedUntil;
                const secondsLeft = Math.max(0, Math.ceil((cachedUntil - now) / 1000));
                this.cacheEl.textContent = `cached for ${formatSeconds(secondsLeft)}`;
            } else {
                this.lastCachedUntilMs = null;
                this.cacheEl.textContent = '';
            }
        }

        setUsage(usage) {
            const session = usage?.five_hour || null;
            const weekly = usage?.seven_day || null;
            if (session && typeof session.utilization === 'number') {
                this.sessionPct = Math.max(0, Math.min(100, session.utilization));
                this.sessionBarFill.style.width = `${this.sessionPct}%`;
                this.sessionResetMs = session.resets_at ? Date.parse(session.resets_at) : null;
            } else {
                this.sessionBarFill.style.width = `0%`;
                this.sessionPct = null;
                this.sessionResetMs = null;
            }
            if (weekly && typeof weekly.utilization === 'number') {
                this.weeklyPct = Math.max(0, Math.min(100, weekly.utilization));
                this.weeklyBarFill.style.width = `${this.weeklyPct}%`;
                this.weeklyResetMs = weekly.resets_at ? Date.parse(weekly.resets_at) : null;
            } else {
                this.weeklyBarFill.style.width = `0%`;
                this.weeklyPct = null;
                this.weeklyResetMs = null;
            }
            this.updateUsageDisplay();
        }

        setPendingCache(val) { /* Placeholder for compatibility */ }

        tick() {
            const now = Date.now();
            if (this.lastCachedUntilMs && this.lastCachedUntilMs > now) {
                const secondsLeft = Math.max(0, Math.ceil((this.lastCachedUntilMs - now) / 1000));
                this.cacheEl.textContent = `cached for ${formatSeconds(secondsLeft)}`;
            } else if (this.lastCachedUntilMs && this.lastCachedUntilMs <= now) {
                this.lastCachedUntilMs = null;
                this.cacheEl.textContent = '';
            }
            this.updateUsageDisplay();
        }

        // Compatibility methods
        attachHeader() {}
        attachUsageLine() {}
    }

    CC.ui = { CounterUI };

    // ==========================================
    // 7. main.js
    // ==========================================
    if (!CC.__started) {
        CC.__started = true;

        function getConversationId() {
            const match = window.location.pathname.match(/\/chat\/([^/?]+)/);
            return match ? match[1] : null;
        }

        function getOrgIdFromCookie() {
            try {
                return document.cookie.split('; ').find((row) => row.startsWith('lastActiveOrg='))?.split('=')[1] || null;
            } catch { return null; }
        }

        function waitForElement(selector, timeoutMs) {
            return new Promise((resolve) => {
                const existing = document.querySelector(selector);
                if (existing) { resolve(existing); return; }
                let timeoutId;
                const observer = new MutationObserver(() => {
                    const el = document.querySelector(selector);
                    if (el) { if (timeoutId) clearTimeout(timeoutId); observer.disconnect(); resolve(el); }
                });
                observer.observe(document.body, { childList: true, subtree: true });
                if (timeoutMs) { timeoutId = setTimeout(() => { observer.disconnect(); resolve(null); }, timeoutMs); }
            });
        }

        CC.waitForElement = waitForElement;

        function observeUrlChanges(callback) {
            let lastPath = window.location.pathname;
            const fireIfChanged = () => {
                const current = window.location.pathname;
                if (current !== lastPath) { lastPath = current; callback(); }
            };
            window.addEventListener('cc:urlchange', fireIfChanged);
            window.addEventListener('popstate', fireIfChanged);
            return () => {
                window.removeEventListener('cc:urlchange', fireIfChanged);
                window.removeEventListener('popstate', fireIfChanged);
            };
        }

        function parseUsageFromUsageEndpoint(raw) {
            if (!raw || typeof raw !== 'object') return null;
            const normalizeWindow = (w, hours) => {
                if (!w || typeof w !== 'object') return null;
                if (typeof w.utilization !== 'number' || !Number.isFinite(w.utilization)) return null;
                const utilization = Math.max(0, Math.min(100, w.utilization));
                const resets_at = typeof w.resets_at === 'string' ? w.resets_at : null;
                return { utilization, resets_at, window_hours: hours };
            };
            const fiveHour = normalizeWindow(raw.five_hour, 5);
            const sevenDay = normalizeWindow(raw.seven_day, 24 * 7);
            if (!fiveHour && !sevenDay) return null;
            return { five_hour: fiveHour, seven_day: sevenDay };
        }

        function parseUsageFromMessageLimit(raw) {
            if (!raw?.windows || typeof raw.windows !== 'object') return null;
            const normalizeWindow = (w, hours) => {
                if (!w || typeof w !== 'object') return null;
                if (typeof w.utilization !== 'number' || !Number.isFinite(w.utilization)) return null;
                const utilization = Math.max(0, Math.min(100, w.utilization * 100));
                const resets_at = typeof w.resets_at === 'number' && Number.isFinite(w.resets_at) ? new Date(w.resets_at * 1000).toISOString() : null;
                return { utilization, resets_at, window_hours: hours };
            };
            const fiveHour = normalizeWindow(raw.windows['5h'], 5);
            const sevenDay = normalizeWindow(raw.windows['7d'], 24 * 7);
            if (!fiveHour && !sevenDay) return null;
            return { five_hour: fiveHour, seven_day: sevenDay };
        }

        let currentConversationId = null;
        let currentOrgId = null;
        let usageState = null;
        let usageResetMs = { five_hour: null, seven_day: null };
        let lastUsageSseMs = 0;
        let usageFetchInFlight = false;
        let lastUsageUpdateMs = 0;
        const rolloverHandledForResetMs = { five_hour: null, seven_day: null };

        const ui = new CC.ui.CounterUI({ onUsageRefresh: async () => { await refreshUsage(); } });
        ui.initialize();

        const bridgeReady = CC.injectBridgeOnce();

        function applyUsageUpdate(normalized, source) {
            if (!normalized) return;
            const now = Date.now();
            usageState = normalized;
            lastUsageUpdateMs = now;
            if (source === 'sse') lastUsageSseMs = now;
            usageResetMs.five_hour = normalized.five_hour?.resets_at ? Date.parse(normalized.five_hour.resets_at) : null;
            usageResetMs.seven_day = normalized.seven_day?.resets_at ? Date.parse(normalized.seven_day.resets_at) : null;
            ui.setUsage(normalized);
        }

        function updateOrgIdIfNeeded(newOrgId) {
            if (newOrgId && typeof newOrgId === 'string' && newOrgId !== currentOrgId) { currentOrgId = newOrgId; }
        }

        async function refreshUsage() {
            await bridgeReady;
            const orgId = currentOrgId || getOrgIdFromCookie();
            if (!orgId) return;
            updateOrgIdIfNeeded(orgId);
            if (usageFetchInFlight) return;
            usageFetchInFlight = true;
            let raw;
            try { raw = await CC.bridge.requestUsage(orgId); } catch { return; } finally { usageFetchInFlight = false; }
            const parsed = parseUsageFromUsageEndpoint(raw);
            applyUsageUpdate(parsed, 'usage');
        }

        async function refreshConversation() {
            await bridgeReady;
            if (!currentConversationId) { ui.setConversationMetrics(); return; }
            const orgId = currentOrgId || getOrgIdFromCookie();
            if (!orgId) return;
            updateOrgIdIfNeeded(orgId);
            try { await CC.bridge.requestConversation(orgId, currentConversationId); } catch { }
        }

        function handleGenerationStart() { if (!currentConversationId) return; ui.setPendingCache(true); }

        async function handleConversationPayload({ orgId, conversationId, data }) {
            if (!conversationId || conversationId !== currentConversationId) return;
            updateOrgIdIfNeeded(orgId);
            if (!data) return;
            const metrics = await CC.tokens.computeConversationMetrics(data);
            ui.setConversationMetrics({ totalTokens: metrics.totalTokens, cachedUntil: metrics.cachedUntil });
        }

        function handleMessageLimit(messageLimit) {
            const parsed = parseUsageFromMessageLimit(messageLimit);
            applyUsageUpdate(parsed, 'sse');
        }

        CC.bridge.on('cc:generation_start', handleGenerationStart);
        CC.bridge.on('cc:conversation', handleConversationPayload);
        CC.bridge.on('cc:message_limit', handleMessageLimit);

        async function handleUrlChange() {
            currentConversationId = getConversationId();
            if (!currentConversationId) { ui.setConversationMetrics(); return; }
            updateOrgIdIfNeeded(getOrgIdFromCookie());
            await refreshConversation();
            if (!usageState) await refreshUsage();
        }

        const unobserveUrl = observeUrlChanges(handleUrlChange);
        window.addEventListener('beforeunload', unobserveUrl);

        // Refresh on branch navigation
        let branchObserver = null;
        document.addEventListener('click', (e) => {
            if (!currentConversationId) return;
            const btn = e.target.closest('button[aria-label="Previous"], button[aria-label="Next"]');
            if (!btn) return;

            const container = btn.closest('.inline-flex');
            const spans = container?.querySelectorAll('span') || [];
            const indicator = Array.from(spans).find((s) => /^\d+\s*\/\s*\d+$/.test(s.textContent.trim()));
            if (!indicator) return;

            const originalText = indicator.textContent;
            if (branchObserver) branchObserver.disconnect();

            branchObserver = new MutationObserver(() => {
                if (indicator.textContent !== originalText) {
                    branchObserver.disconnect();
                    branchObserver = null;
                    refreshConversation();
                }
            });

            branchObserver.observe(indicator, { childList: true, characterData: true, subtree: true });

            setTimeout(() => {
                if (branchObserver) { branchObserver.disconnect(); branchObserver = null; }
            }, 60000);
        });

        handleUrlChange();

        function tick() {
            ui.tick();
            const now = Date.now();
            if (usageResetMs.five_hour && now >= usageResetMs.five_hour && rolloverHandledForResetMs.five_hour !== usageResetMs.five_hour) {
                rolloverHandledForResetMs.five_hour = usageResetMs.five_hour;
                refreshUsage();
            }
            if (usageResetMs.seven_day && now >= usageResetMs.seven_day && rolloverHandledForResetMs.seven_day !== usageResetMs.seven_day) {
                rolloverHandledForResetMs.seven_day = usageResetMs.seven_day;
                refreshUsage();
            }
            const ONE_HOUR_MS = 60 * 60 * 1000;
            if (!document.hidden && (now - lastUsageSseMs) > ONE_HOUR_MS && (now - lastUsageUpdateMs) > ONE_HOUR_MS) {
                refreshUsage();
            }
        }
        setInterval(tick, 1000);
    }
})();
