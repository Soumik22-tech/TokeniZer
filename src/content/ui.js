(() => {
	'use strict';

	const CC = (globalThis.ClaudeCounter = globalThis.ClaudeCounter || {});

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

		const hide = () => {
			tooltip.style.opacity = '0';
			clearTimeout(hideTimer);
		};

		element.addEventListener('pointerdown', (e) => {
			if (e.pointerType === 'touch' || e.pointerType === 'pen') {
				pressTimer = setTimeout(() => {
					show();
					hideTimer = setTimeout(hide, 3000);
				}, 500);
			}
		});

		element.addEventListener('pointerup', () => clearTimeout(pressTimer));
		element.addEventListener('pointercancel', () => {
			clearTimeout(pressTimer);
			hide();
		});

		element.addEventListener('pointerenter', (e) => {
			if (e.pointerType === 'mouse') show();
		});

		element.addEventListener('pointerleave', (e) => {
			if (e.pointerType === 'mouse') hide();
		});
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

		// Removed dead code (getProgressChrome, refreshProgressChrome)

	initialize() {
		// build floating widget
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

		// Context window section
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

		// Session usage
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

		// Weekly usage
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

		this.minimizeButton.addEventListener('click', () => {
			this.setCollapsed(!this.isCollapsed);
		});

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
		if (this.sessionMetaEl) {
			this.sessionMetaEl.textContent = formatUsageCopy(this.sessionPct, this.sessionResetMs);
		}
		if (this.weeklyMetaEl) {
			this.weeklyMetaEl.textContent = formatUsageCopy(this.weeklyPct, this.weeklyResetMs);
		}
	}

		// Removed dead code (_observeTheme, _observeDom, _initUsageLine, _setupTooltips)

	attach() {
		// widget already appended to body in initialize
	}

	attachHeader() {
		// kept for compatibility with the original code that expects this method
		// header is part of the floating widget, nothing to attach to page anchors
	}

	attachUsageLine() {
		// kept for compatibility with the original code that expects this method
		// usage bars are inside the floating widget and auto-updated
	}

	setConversationMetrics({ totalTokens, cachedUntil } = {}) {
		if (typeof totalTokens !== 'number') {
			this.tokenCountEl.textContent = '';
			this.cacheEl.textContent = '';
			this.lastCachedUntilMs = null;
				this.updateCompactText();
			return;
		}

		const pct = Math.max(0, Math.min(100, (totalTokens / CC.CONST.CONTEXT_LIMIT_TOKENS) * 100));
			this.tokenCountEl.textContent = formatContextCopy(totalTokens);
			this.updateCompactText();

		// show mini bar via color tint on header (kept simple)

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

		// Removed dead code (_renderHeader)

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

		// Removed dead code (_updateMarkers)

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

		// Update reset labels if present (displayed via tooltips in original; kept minimal here)
	}
	}

	CC.ui = {
		CounterUI
	};
})();
