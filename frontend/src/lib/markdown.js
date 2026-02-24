import { marked } from 'marked';

let isConfigured = false;
const spoilerTimers = new WeakMap();
const defaultWarningText = 'Click once more within 3 seconds to reveal this spoiler.';
const defaultPrivateWarningText = 'Click once more within 3 seconds to reveal this private section.';

function configureMarkdown() {
	if (isConfigured) {
		return;
	}

	const renderer = {
		link(href, title, text) {
			const link = marked.Renderer.prototype.link.call(this, href, title, text);
			return link.replace('<a', "<a target='_blank' rel='noreferrer' ");
		}
	};

	marked.use({
		renderer: renderer,
		breaks: true,
		gfm: true
	});

	isConfigured = true;
}

function replaceSpoilerBlocks(markdownText) {
	return markdownText.replace(/:::spoiler\s*\n([\s\S]*?)\n:::/g, (_match, spoilerContent) => {
		const renderedContent = marked.parse((spoilerContent || '').trim());
		return `<div class="spoiler-block" data-revealed="false" data-armed="false" data-armed-until="0"><div class="spoiler-content">${renderedContent}</div><div class="spoiler-warning" aria-live="polite"></div></div>`;
	});
}

function replacePrivateBlocks(markdownText, isShared = false) {
	return markdownText.replace(/:::private\s*\n([\s\S]*?)\n:::/g, (_match, privateContent) => {
		if (isShared) {
			return '';
		} else {
			const renderedContent = marked.parse((privateContent || '').trim());
			return `<div class="spoiler-block private-block" data-revealed="false" data-armed="false" data-armed-until="0"><div class="spoiler-content">${renderedContent}</div><div class="spoiler-warning" aria-live="polite"></div></div>`;
		}
	});
}

export function parseMarkdown(markdownText, isShared = false) {
	configureMarkdown();
	const source = String(markdownText ?? '');
	const withPrivate = replacePrivateBlocks(source, isShared);
	const withSpoilers = replaceSpoilerBlocks(withPrivate);
	return marked.parse(withSpoilers);
}

function clearArmedState(spoilerBlock) {
	spoilerBlock.dataset.armed = 'false';
	spoilerBlock.dataset.armedUntil = '0';

	const timerId = spoilerTimers.get(spoilerBlock);
	if (timerId) {
		clearTimeout(timerId);
		spoilerTimers.delete(spoilerBlock);
	}
}

function getWarningTextForBlock(spoilerBlock, options = {}) {
	if (spoilerBlock.classList.contains('private-block')) {
		return options.privateWarningText || defaultPrivateWarningText;
	}

	return options.warningText || defaultWarningText;
}

function setInitialWarningText(containerNode, options = {}) {
	containerNode.querySelectorAll('.spoiler-block[data-revealed="false"]').forEach((spoilerBlock) => {
		const warningEl = spoilerBlock.querySelector('.spoiler-warning');
		if (warningEl) {
			warningEl.textContent = getWarningTextForBlock(spoilerBlock, options);
		}
	});
}

function armSpoiler(spoilerBlock, warningText, revealWindowMs) {
	clearArmedState(spoilerBlock);

	spoilerBlock.dataset.armed = 'true';
	spoilerBlock.dataset.armedUntil = String(Date.now() + revealWindowMs);
	const warningEl = spoilerBlock.querySelector('.spoiler-warning');
	if (warningEl) {
		warningEl.textContent = warningText;
	}

	const timerId = setTimeout(() => {
		clearArmedState(spoilerBlock);
	}, revealWindowMs);
	spoilerTimers.set(spoilerBlock, timerId);
}

export function revealSpoilerFromClick(
	event,
	options = {
		warningText: defaultWarningText,
		privateWarningText: defaultPrivateWarningText,
		revealWindowMs: 3000
	}
) {
	const eventTarget = event?.target;
	if (!(eventTarget instanceof Element)) {
		return;
	}

	const spoilerBlock = eventTarget.closest('.spoiler-block');
	if (!spoilerBlock || spoilerBlock.dataset.revealed === 'true') {
		return;
	}

	const warningText = getWarningTextForBlock(spoilerBlock, options);
	const revealWindowMs = Number(options.revealWindowMs) || 3000;
	const armedUntil = Number(spoilerBlock.dataset.armedUntil || '0');
	const now = Date.now();

	if (armedUntil > now && spoilerBlock.dataset.armed === 'true') {
		clearArmedState(spoilerBlock);
		spoilerBlock.dataset.revealed = 'true';
		return;
	}

	armSpoiler(spoilerBlock, warningText, revealWindowMs);
}

export function spoilerRevealAction(
	node,
	options = {
		warningText: defaultWarningText,
		privateWarningText: defaultPrivateWarningText,
		revealWindowMs: 3000
	}
) {
	let actionOptions = options;
	setInitialWarningText(node, actionOptions);

	const clickHandler = (event) => {
		revealSpoilerFromClick(event, actionOptions);
	};

	node.addEventListener('click', clickHandler);

	return {
		update(newOptions) {
			actionOptions = newOptions;
			setInitialWarningText(node, actionOptions);
		},
		destroy() {
			node.removeEventListener('click', clickHandler);
			node.querySelectorAll('.spoiler-block').forEach((spoilerBlock) => {
				clearArmedState(spoilerBlock);
			});
		}
	};
}