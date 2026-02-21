import { marked } from 'marked';

let isConfigured = false;
const spoilerTimers = new WeakMap();

function configureMarkdown() {
	if (isConfigured) {
		return;
	}

	marked.use({
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

export function parseMarkdown(markdownText) {
	configureMarkdown();
	const source = String(markdownText ?? '');
	const withSpoilers = replaceSpoilerBlocks(source);
	return marked.parse(withSpoilers);
}

function clearArmedState(spoilerBlock) {
	spoilerBlock.dataset.armed = 'false';
	spoilerBlock.dataset.armedUntil = '0';
	const warningEl = spoilerBlock.querySelector('.spoiler-warning');
	if (warningEl) {
		warningEl.textContent = '';
	}

	const timerId = spoilerTimers.get(spoilerBlock);
	if (timerId) {
		clearTimeout(timerId);
		spoilerTimers.delete(spoilerBlock);
	}
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
		warningText: 'Click once more within 3 seconds to reveal this spoiler.',
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

	const warningText = options.warningText || 'Click once more within 3 seconds to reveal this spoiler.';
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
		warningText: 'Click once more within 3 seconds to reveal this spoiler.',
		revealWindowMs: 3000
	}
) {
	let actionOptions = options;

	const clickHandler = (event) => {
		revealSpoilerFromClick(event, actionOptions);
	};

	node.addEventListener('click', clickHandler);

	return {
		update(newOptions) {
			actionOptions = newOptions;
		},
		destroy() {
			node.removeEventListener('click', clickHandler);
			node.querySelectorAll('.spoiler-block').forEach((spoilerBlock) => {
				clearArmedState(spoilerBlock);
			});
		}
	};
}