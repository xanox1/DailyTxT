<script>
	import { slide } from 'svelte/transition';
	import { Fa } from 'svelte-fa';
	import { faCopy, faCheck, faLink, faTrash, faRotate } from '@fortawesome/free-solid-svg-icons';
	import { getTranslate } from '@tolgee/svelte';

	const { t } = getTranslate();

	let {
		hasShareToken,
		shareLink,
		isGeneratingShareToken,
		isRevokingShareToken,
		linkCopiedSuccess,
		showShareTokenError,
		generateShareToken,
		revokeShareToken,
		copyShareLink,
		shareVerificationEmailsText = $bindable(''),
		isLoadingShareVerificationSettings,
		isSavingShareVerificationSettings,
		showShareVerificationSettingsError,
		showShareVerificationSettingsSuccess,
		shareVerificationSMTPConfigured,
		saveShareVerificationSettings,
		shareAccessLogs,
		isLoadingShareAccessLogs,
		loadShareAccessLogs,
		clearShareAccessLogs,
		isClearingShareAccessLogs,
		shareSMTPHost = $bindable(''),
		shareSMTPPort = $bindable(587),
		shareSMTPUsername = $bindable(''),
		shareSMTPPassword = $bindable(''),
		shareSMTPFrom = $bindable(''),
		shareSMTPTestRecipient = $bindable(''),
		saveShareSMTPSettings,
		isSavingShareSMTPSettings,
		showShareSMTPSettingsError,
		showShareSMTPSettingsSuccess,
		testShareSMTP,
		isTestingShareSMTP,
		showShareSMTPTestError,
		showShareSMTPTestSuccess,
		shareSessionCookieDays = $bindable(30),
		shareSessionCookieVersion = 1,
		isLoadingShareSessionSettings,
		isSavingShareSessionSettings,
		showShareSessionSettingsError,
		showShareSessionSettingsSuccess,
		isInvalidatingShareSessionCookies,
		loadShareSessionSettings,
		saveShareSessionSettings,
		invalidateShareSessionCookies
	} = $props();

	function formatDate(value) {
		if (!value) return '-';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return date.toLocaleString();
	}

	function confirmClearLogs() {
		if (window.confirm('Clear all share access logs? This cannot be undone.')) {
			clearShareAccessLogs();
		}
	}

	function confirmInvalidateShareSessions() {
		if (window.confirm($t('settings.sharing_session.confirm_invalidate'))) {
			invalidateShareSessionCookies();
		}
	}

	function groupedShareAccessLogs() {
		if (!shareAccessLogs || shareAccessLogs.length === 0) {
			return [];
		}

		const getLogEmail = (log) => {
			const rawEmail = log?.email ?? '';
			return String(rawEmail).trim().toLowerCase();
		};

		const sortedLogs = [...shareAccessLogs].sort((a, b) => {
			const timeA = new Date(a?.time || 0).getTime();
			const timeB = new Date(b?.time || 0).getTime();
			return timeB - timeA;
		});

		const grouped = new Map();
		for (const log of sortedLogs) {
			const email = getLogEmail(log) || '-';
			if (!grouped.has(email)) {
				grouped.set(email, []);
			}
			grouped.get(email).push(log);
		}

		return Array.from(grouped.entries()).map(([email, items]) => ({
			email,
			items
		}));
	}

	function shareAccessLogStats() {
		const total = shareAccessLogs?.length || 0;
		const uniqueEmails = new Set(
			(shareAccessLogs || [])
				.map((log) => String(log?.email || '').trim().toLowerCase())
				.filter((email) => email !== '')
		);

		return {
			total,
			unique: uniqueEmails.size
		};
	}
</script>

<h3 class="text-primary">🔗 Sharing</h3>
<div>
	<p class="form-text mb-3">
		Generate a secret read-only link to share your diary entries with others. Anyone with this link
		can view your diary without needing to log in. Revoke the link at any time to disable access.
	</p>

	{#if shareLink}
		<div class="mb-3" transition:slide>
			<label for="shareLinkInput" class="form-label fw-semibold">Share Link</label>
			<div class="input-group">
				<input id="shareLinkInput" type="text" class="form-control font-monospace" value={shareLink} readonly />
				<button class="btn btn-outline-secondary" onclick={copyShareLink} title="Copy link">
					{#if linkCopiedSuccess}
						<Fa icon={faCheck} class="text-success" />
					{:else}
						<Fa icon={faCopy} />
					{/if}
				</button>
			</div>
			<div class="form-text">Keep this link private — it grants read access to your diary.</div>
		</div>
	{/if}

	<div class="d-flex flex-row gap-2 flex-wrap">
		{#if !hasShareToken}
			<button
				class="btn btn-primary"
				onclick={generateShareToken}
				disabled={isGeneratingShareToken}
			>
				{#if isGeneratingShareToken}
					<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"
					></span>
				{:else}
					<Fa icon={faLink} class="me-2" />
				{/if}
				Generate Share Link
			</button>
		{:else}
			<button
				class="btn btn-outline-secondary"
				onclick={generateShareToken}
				disabled={isGeneratingShareToken}
				title="Generate a new link (invalidates the old one)"
			>
				{#if isGeneratingShareToken}
					<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"
					></span>
				{:else}
					<Fa icon={faRotate} class="me-2" />
				{/if}
				Regenerate Link
			</button>
			<button
				class="btn btn-outline-danger"
				onclick={revokeShareToken}
				disabled={isRevokingShareToken}
			>
				{#if isRevokingShareToken}
					<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"
					></span>
				{:else}
					<Fa icon={faTrash} class="me-2" />
				{/if}
				Revoke Link
			</button>
		{/if}
	</div>

	{#if showShareTokenError}
		<div class="alert alert-danger mt-2" role="alert" transition:slide>
			An error occurred. Please try again.
		</div>
	{/if}

	<hr class="my-4" />

	<h5 class="mb-2">SMTP settings</h5>
	<p class="form-text mb-2">Configure SMTP to send verification and test emails.</p>

	<div class="row g-2 mb-2">
		<div class="col-md-8">
			<label class="form-label" for="smtpHost">SMTP host</label>
			<input id="smtpHost" class="form-control" bind:value={shareSMTPHost} placeholder="smtp.example.com" />
		</div>
		<div class="col-md-4">
			<label class="form-label" for="smtpPort">Port</label>
			<input id="smtpPort" type="number" class="form-control" bind:value={shareSMTPPort} min="1" />
		</div>
	</div>

	<div class="row g-2 mb-2">
		<div class="col-md-6">
			<label class="form-label" for="smtpUsername">Username</label>
			<input id="smtpUsername" class="form-control" bind:value={shareSMTPUsername} />
		</div>
		<div class="col-md-6">
			<label class="form-label" for="smtpPassword">Password</label>
			<input id="smtpPassword" type="password" class="form-control" bind:value={shareSMTPPassword} />
		</div>
	</div>

	<div class="mb-2">
		<label class="form-label" for="smtpFrom">From email</label>
		<input id="smtpFrom" type="email" class="form-control" bind:value={shareSMTPFrom} placeholder="mailer@example.com" />
	</div>

	<div class="d-flex gap-2 mb-3 flex-wrap">
		<button class="btn btn-outline-primary" onclick={saveShareSMTPSettings} disabled={isSavingShareSMTPSettings}>
			{#if isSavingShareSMTPSettings}
				<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
			{/if}
			Save SMTP settings
		</button>
	</div>

	<div class="row g-2 align-items-end mb-3">
		<div class="col-md-8">
			<label class="form-label" for="smtpTestRecipient">Test recipient email</label>
			<input id="smtpTestRecipient" type="email" class="form-control" bind:value={shareSMTPTestRecipient} placeholder="you@example.com" />
		</div>
		<div class="col-md-4">
			<button class="btn btn-outline-secondary w-100" onclick={testShareSMTP} disabled={isTestingShareSMTP}>
				{#if isTestingShareSMTP}
					<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
				{/if}
				Send test email
			</button>
		</div>
	</div>

	{#if showShareSMTPSettingsError}
		<div class="alert alert-danger mb-2" role="alert" transition:slide>
			Could not save SMTP settings.
		</div>
	{/if}
	{#if showShareSMTPSettingsSuccess}
		<div class="alert alert-success mb-2" role="alert" transition:slide>
			SMTP settings saved.
		</div>
	{/if}
	{#if showShareSMTPTestError}
		<div class="alert alert-danger mb-2" role="alert" transition:slide>
			Could not send test email. Please check SMTP settings.
		</div>
	{/if}
	{#if showShareSMTPTestSuccess}
		<div class="alert alert-success mb-2" role="alert" transition:slide>
			Test email sent successfully.
		</div>
	{/if}

	<hr class="my-4" />

	<h5 class="mb-2">Email whitelist verification</h5>
	<p class="form-text mb-2">
		Enter one email per line (or comma-separated). Only these addresses can open shared links.
	</p>

	{#if !shareVerificationSMTPConfigured}
		<div class="alert alert-warning" role="alert">
			SMTP is not configured on the server. Verification emails cannot be sent until SMTP is set.
		</div>
	{/if}

	<textarea
		class="form-control mb-2"
		rows="5"
		bind:value={shareVerificationEmailsText}
		disabled={isLoadingShareVerificationSettings || isSavingShareVerificationSettings}
		placeholder="alice@example.com&#10;bob@example.com"
	></textarea>

	<div class="d-flex gap-2 mb-3">
		<button
			class="btn btn-primary"
			onclick={saveShareVerificationSettings}
			disabled={isLoadingShareVerificationSettings || isSavingShareVerificationSettings}
		>
			{#if isSavingShareVerificationSettings}
				<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
			{/if}
			Save whitelist
		</button>
	</div>

	{#if showShareVerificationSettingsError}
		<div class="alert alert-danger mb-3" role="alert" transition:slide>
			Could not save verification settings.
		</div>
	{/if}
	{#if showShareVerificationSettingsSuccess}
		<div class="alert alert-success mb-3" role="alert" transition:slide>
			Verification settings saved.
		</div>
	{/if}

	<hr class="my-4" />

	<h5 class="mb-2">{$t('settings.sharing_session.title')}</h5>
	<p class="form-text mb-2">
		{$t('settings.sharing_session.description')}
	</p>

	<div class="row g-2 align-items-end mb-2">
		<div class="col-md-4">
			<label class="form-label" for="shareSessionCookieDays">{$t('settings.sharing_session.timeout_label')}</label>
			<input
				id="shareSessionCookieDays"
				type="number"
				class="form-control"
				min="1"
				max="365"
				bind:value={shareSessionCookieDays}
				disabled={isLoadingShareSessionSettings || isSavingShareSessionSettings}
			/>
		</div>
		<div class="col-md-8 d-flex gap-2 flex-wrap">
			<button
				class="btn btn-outline-primary"
				onclick={saveShareSessionSettings}
				disabled={isLoadingShareSessionSettings || isSavingShareSessionSettings}
			>
				{#if isSavingShareSessionSettings}
					<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
				{/if}
				{$t('settings.sharing_session.save_button')}
			</button>
			<button class="btn btn-outline-secondary" onclick={loadShareSessionSettings} disabled={isLoadingShareSessionSettings}>
				{$t('settings.sharing_session.refresh_button')}
			</button>
			<button
				class="btn btn-outline-danger"
				onclick={confirmInvalidateShareSessions}
				disabled={isInvalidatingShareSessionCookies}
			>
				{#if isInvalidatingShareSessionCookies}
					<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
				{/if}
				{$t('settings.sharing_session.invalidate_button')}
			</button>
		</div>
	</div>

	<div class="form-text mb-3">{$t('settings.sharing_session.current_version')}: {shareSessionCookieVersion}</div>

	{#if showShareSessionSettingsError}
		<div class="alert alert-danger mb-2" role="alert" transition:slide>
			{$t('settings.sharing_session.error')}
		</div>
	{/if}
	{#if showShareSessionSettingsSuccess}
		<div class="alert alert-success mb-2" role="alert" transition:slide>
			{$t('settings.sharing_session.success')}
		</div>
	{/if}

	<hr class="my-4" />

	<div class="d-flex align-items-center justify-content-between mb-2">
		<h5 class="mb-0">Share access log</h5>
		<div class="d-flex gap-2">
			<button class="btn btn-sm btn-outline-secondary" onclick={loadShareAccessLogs} disabled={isLoadingShareAccessLogs}>
				<Fa icon={faRotate} class="me-1" />
				Refresh
			</button>
			<button class="btn btn-sm btn-outline-danger" onclick={confirmClearLogs} disabled={isClearingShareAccessLogs}>
				Clear
			</button>
		</div>
	</div>

	{#if isLoadingShareAccessLogs}
		<div class="d-flex align-items-center gap-2 form-text">
			<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
			Loading access log…
		</div>
	{:else if !shareAccessLogs || shareAccessLogs.length === 0}
		<div class="form-text">No share access entries yet.</div>
	{:else}
		{@const stats = shareAccessLogStats()}
		<div class="form-text mb-2">
			Debug: {stats.total} log entries, {stats.unique} unique email addresses.
		</div>
		<div class="d-flex flex-column gap-2">
			{#each groupedShareAccessLogs() as group, index (group.email)}
				<details class="share-log-group" open={index === 0}>
					<summary class="share-log-summary">
						<span class="share-log-email me-2">{group.email}</span>
						<span class="badge text-bg-secondary">{group.items.length}</span>
					</summary>
					<div class="table-responsive share-log-group-scroll mt-2">
						<table class="table table-sm table-striped align-middle mb-0">
							<thead>
								<tr>
									<th>Time</th>
									<th>IP</th>
									<th>Event</th>
								</tr>
							</thead>
							<tbody>
								{#each group.items as log}
									<tr>
										<td>{formatDate(log.time)}</td>
										<td>{log.ip || '-'}</td>
										<td>{log.event || '-'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</details>
			{/each}
		</div>
	{/if}
</div>

<style>
	.share-log-group {
		border: 1px solid var(--bs-border-color);
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: var(--bs-body-bg);
	}

	.share-log-summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		cursor: pointer;
		font-weight: 600;
		list-style: none;
	}

	.share-log-summary::-webkit-details-marker {
		display: none;
	}

	.share-log-group-scroll {
		max-height: 260px;
		overflow-y: auto;
	}

	.share-log-email {
		overflow-wrap: anywhere;
	}
</style>
