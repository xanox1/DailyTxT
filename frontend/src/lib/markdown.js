import { marked } from 'marked';

let isConfigured = false;

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

function replaceSpoilerBlocks(markdownText, spoilerButtonLabel) {
	return markdownText.replace(/:::spoiler\s*\n([\s\S]*?)\n:::/g, (_match, spoilerContent) => {
		const renderedContent = marked.parse((spoilerContent || '').trim());
		return `<div class="spoiler-block" data-revealed="false"><button type="button" class="spoiler-reveal-btn btn btn-sm btn-outline-secondary mb-2">${spoilerButtonLabel}</button><div class="spoiler-content">${renderedContent}</div></div>`;
	});
}

export function parseMarkdown(markdownText, options = {}) {
	configureMarkdown();
	const source = String(markdownText ?? '');
	const spoilerButtonLabel = options.spoilerButtonLabel || 'Reveal spoiler';
	const withSpoilers = replaceSpoilerBlocks(source, spoilerButtonLabel);
	return marked.parse(withSpoilers);
}

export function revealSpoilerFromClick(event, confirmationText = 'This content is hidden as a spoiler. Reveal it?') {
	const eventTarget = event?.target;
	if (!(eventTarget instanceof Element)) {
		return;
	}

	const revealButton = eventTarget.closest('.spoiler-reveal-btn');
	if (!revealButton) {
		return;
	}

	const spoilerBlock = revealButton.closest('.spoiler-block');
	if (!spoilerBlock || spoilerBlock.dataset.revealed === 'true') {
		return;
	}

	if (window.confirm(confirmationText)) {
		spoilerBlock.dataset.revealed = 'true';
	}
}