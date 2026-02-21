<script>
	import { API_URL } from '$lib/APIurl.js';
	import axios from 'axios';
	import { parseMarkdown, spoilerRevealAction } from '$lib/markdown.js';
	import ImageViewer from '$lib/ImageViewer.svelte';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { getTranslate, getTolgee } from '@tolgee/svelte';

	const { t } = getTranslate();
	const tolgee = getTolgee(['language']);

	let token = $derived(page.params.token);

	// Calendar state
	let currentYear = $state(new Date().getFullYear());
	let currentMonth = $state(new Date().getMonth()); // 0-indexed

	let logs = $state([]);
	let isLoadingMonthForReading = $state(false);
	let isInvalidToken = $state(false);
	let isVerificationRequired = $state(false);
	let isShareVerified = $state(false);
	let verificationEmail = $state('');
	let verificationCode = $state('');
	let isRequestingCode = $state(false);
	let isVerifyingCode = $state(false);
	let verificationError = $state('');
	let verificationSuccess = $state('');
	let codeSent = $state(false);

	function getMonthLabel(year, monthIndex) {
		return new Date(year, monthIndex, 1).toLocaleDateString($tolgee.getLanguage(), {
			month: 'long',
			year: 'numeric'
		});
	}

	function prevMonth() {
		if (currentMonth === 0) {
			currentMonth = 11;
			currentYear -= 1;
		} else {
			currentMonth -= 1;
		}
	}

	function nextMonth() {
		if (currentMonth === 11) {
			currentMonth = 0;
			currentYear += 1;
		} else {
			currentMonth += 1;
		}
	}

	function scrollToDay(day) {
		const el = document.querySelector(`.log[data-log-day="${day}"]`);
		if (el) {
			el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}

	// Re-load whenever month/year changes
	$effect(() => {
		// track both reactive values
		const _year = currentYear;
		const _month = currentMonth;
		const _token = token;
		if (_token) {
			untrack(() => {
				loadMonthForSharedReading(_year, _month);
			});
		}
	});

	async function loadMonthForSharedReading(year, month) {
		const status = await checkVerificationStatus();
		if (!status || (status.required && !status.verified)) {
			return;
		}

		loadMonthForReading(year, month);
	}

	async function checkVerificationStatus() {
		try {
			const response = await axios.get(API_URL + '/share/verificationStatus', {
				params: { token }
			});
			isVerificationRequired = response.data.required === true;
			isShareVerified = response.data.verified === true;
			verificationError = '';
			return response.data;
		} catch (error) {
			if (error.response?.status === 401) {
				isInvalidToken = true;
			} else {
				verificationError = $t('shareView.verification.error_status');
			}
			console.error(error);
			return null;
		}
	}

	function loadMonthForReading(year, month) {
		if (isLoadingMonthForReading) return;
		isLoadingMonthForReading = true;
		logs = [];

		axios
			.get(API_URL + '/share/loadMonthForReading', {
				params: { token, year, month: month + 1 }
			})
			.then((response) => {
				logs = response.data.sort((a, b) => a.day - b.day);
			})
			.catch((error) => {
				if (error.response?.status === 401) {
					isInvalidToken = true;
				} else if (error.response?.status === 403) {
					isVerificationRequired = true;
					isShareVerified = false;
				}
				console.error(error);
			})
			.finally(() => {
				isLoadingMonthForReading = false;
			});
	}

	async function requestVerificationCode() {
		verificationError = '';
		verificationSuccess = '';
		if (!verificationEmail) {
			verificationError = $t('shareView.verification.error_email_required');
			return;
		}

		isRequestingCode = true;
		try {
			await axios.post(
				API_URL + '/share/requestVerificationCode',
				{ email: verificationEmail, language: $tolgee.getLanguage() },
				{ params: { token } }
			);
			codeSent = true;
			verificationSuccess = $t('shareView.verification.success_code_sent');
		} catch (error) {
			if (error.response?.status === 403) {
				verificationError = $t('shareView.verification.error_email_not_allowed');
			} else if (error.response?.status === 400) {
				verificationError = $t('shareView.verification.error_email_invalid');
			} else {
				verificationError = $t('shareView.verification.error_send_code');
			}
			console.error(error);
		} finally {
			isRequestingCode = false;
		}
	}

	async function verifyShareCode() {
		verificationError = '';
		verificationSuccess = '';
		if (!verificationEmail || !verificationCode) {
			verificationError = $t('shareView.verification.error_code_required');
			return;
		}

		isVerifyingCode = true;
		try {
			await axios.post(
				API_URL + '/share/verifyCode',
				{ email: verificationEmail, code: verificationCode },
				{ params: { token } }
			);
			isShareVerified = true;
			verificationCode = '';
			verificationSuccess = $t('shareView.verification.success_verified');
			await loadMonthForSharedReading(currentYear, currentMonth);
		} catch (error) {
			if (error.response?.status === 403) {
				verificationError = $t('shareView.verification.error_code_invalid');
			} else {
				verificationError = $t('shareView.verification.error_verify_failed');
			}
			console.error(error);
		} finally {
			isVerifyingCode = false;
		}
	}

	const imageExtensions = ['jpeg', 'jpg', 'gif', 'png', 'webp', 'bmp'];

	function getImageSrc(uuid) {
		return API_URL + '/share/downloadFile?token=' + encodeURIComponent(token) + '&uuid=' + encodeURIComponent(uuid);
	}

	function downloadFile(uuid, filename) {
		const a = document.createElement('a');
		a.href = API_URL + '/share/downloadFile?token=' + encodeURIComponent(token) + '&uuid=' + encodeURIComponent(uuid);
		a.download = filename || uuid;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	function isImage(filename) {
		const ext = filename?.split('.').pop()?.toLowerCase();
		return imageExtensions.includes(ext);
	}

	function getImageEntries(files = []) {
		return files
			.filter((file) => isImage(file.filename))
			.map((file) => ({
				uuid_filename: file.uuid_filename,
				filename: file.filename,
				src: getImageSrc(file.uuid_filename)
			}));
	}

	function getNonImageEntries(files = []) {
		return files.filter((file) => !isImage(file.filename));
	}
</script>

<svelte:head>
	<title>{$t('shareView.page_title')}</title>
</svelte:head>

{#if isInvalidToken}
	<div class="d-flex align-items-center justify-content-center h-100">
		<div class="glass p-5 rounded-5 text-center">
			<h3>🔒 {$t('shareView.invalid.title')}</h3>
			<p class="text-muted mt-2">{$t('shareView.invalid.description')}</p>
		</div>
	</div>
{:else}
	<div class="layout-read d-flex flex-column container-xxl">
		<div class="d-flex justify-content-between align-items-center mt-3 mb-2 px-2">
			<div class="d-flex align-items-center gap-2">
				<span class="fw-semibold">📖 DailyTxT</span>
				<span class="badge bg-secondary">{$t('shareView.badge_read_only')}</span>
			</div>
			<div class="d-flex align-items-center gap-2">
				<button class="btn btn-sm btn-outline-secondary" onclick={prevMonth}>‹</button>
				<span class="fw-semibold">{getMonthLabel(currentYear, currentMonth)}</span>
				<button class="btn btn-sm btn-outline-secondary" onclick={nextMonth}>›</button>
			</div>
		</div>

		{#if isVerificationRequired && !isShareVerified}
			<div class="d-flex align-items-center justify-content-center h-100 p-3">
				<div class="glass p-4 rounded-5 verification-box w-100">
					<h4 class="mb-2">{$t('shareView.verification.title')}</h4>
					<p class="text-muted mb-3">{$t('shareView.verification.description')}</p>

					<div class="mb-3">
						<label class="form-label" for="verificationEmail">{$t('shareView.verification.email_label')}</label>
						<input
							id="verificationEmail"
							type="email"
							class="form-control"
							bind:value={verificationEmail}
							autocomplete="email"
						/>
					</div>

					<button class="btn btn-primary mb-3" onclick={requestVerificationCode} disabled={isRequestingCode}>
						{#if isRequestingCode}
							<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
						{/if}
						{$t('shareView.verification.send_code')}
					</button>

					{#if codeSent}
						<div class="mb-3">
							<label class="form-label" for="verificationCode">{$t('shareView.verification.code_label')}</label>
							<input
								id="verificationCode"
								type="text"
								class="form-control"
								bind:value={verificationCode}
								maxlength="6"
								inputmode="numeric"
							/>
						</div>
						<button class="btn btn-success" onclick={verifyShareCode} disabled={isVerifyingCode}>
							{#if isVerifyingCode}
								<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
							{/if}
							{$t('shareView.verification.verify_code')}
						</button>
					{/if}

					{#if verificationError}
						<div class="alert alert-danger mt-3 mb-0" role="alert">{verificationError}</div>
					{/if}
					{#if verificationSuccess}
						<div class="alert alert-success mt-3 mb-0" role="alert">{verificationSuccess}</div>
					{/if}
				</div>
			</div>
		{:else}
			<div class="d-flex flex-column my-2 flex-fill overflow-y-auto" id="scrollArea">
				{#if isLoadingMonthForReading}
					<div class="d-flex align-items-center justify-content-center h-100">
						<div class="glass p-5 rounded-5 no-entries">
							<div class="spinner-border spinner-border-lg" role="status">
									<span class="visually-hidden">{$t('shareView.loading')}</span>
							</div>
						</div>
					</div>
				{:else if logs.length === 0}
					<div class="d-flex align-items-center justify-content-center h-100">
						<div class="glass p-5 rounded-5 no-entries text-center">
							<span id="no-entries">{$t('read.no_entries')}</span>
						</div>
					</div>
				{:else}
					{#each logs as log (log.day)}
						{#if ('text' in log && log.text !== '') || log.tags?.length > 0 || log.files?.length > 0}
							<div class="log glass mb-3 p-3 d-flex flex-row" data-log-day={log.day}>
								<div class="date me-3 d-flex flex-column align-items-center">
									<p class="dateNumber">{log.day}</p>
									<p class="dateDay">
										<b>
											{new Date(currentYear, currentMonth, log.day).toLocaleDateString($tolgee.getLanguage(), { weekday: 'long' })}
										</b>
									</p>
									<p class="dateMonthYear">
										<i>{new Date(currentYear, currentMonth, log.day).toLocaleDateString($tolgee.getLanguage(), { year: 'numeric', month: 'long' })}</i>
									</p>
								</div>
								<div class="logContent flex-grow-1">
									{#if log.text && log.text !== ''}
										<div class="text" use:spoilerRevealAction={$t('markdown.spoiler.confirm')}>
											{@html parseMarkdown(log.text, { spoilerButtonLabel: $t('markdown.spoiler.reveal_button') })}
										</div>
									{/if}
									{#if log.files && log.files.length > 0}
										{@const imageEntries = getImageEntries(log.files)}
										{@const nonImageEntries = getNonImageEntries(log.files)}

										{#if imageEntries.length > 0}
											<div class="mt-2 files">
												<ImageViewer images={imageEntries} showFilename={false} />
											</div>
										{/if}

										{#if nonImageEntries.length > 0}
											<div class="mt-2 d-flex flex-column gap-1 files">
												{#each nonImageEntries as file}
													<button
														class="btn btn-sm btn-outline-secondary text-start fileBtn"
														onclick={() => downloadFile(file.uuid_filename, file.filename)}
													>
														📎 {file.filename}
													</button>
												{/each}
											</div>
										{/if}
									{/if}
								</div>
							</div>
						{/if}
					{/each}
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	#no-entries {
		font-size: 1.5rem;
		font-weight: 600;
		opacity: 0.7;
	}

	.layout-read {
		height: 100%;
		overflow: hidden;
	}

	.no-entries {
		min-width: 320px;
		text-align: center;
	}

	.files {
		max-width: 100%;
	}

	.verification-box {
		max-width: 520px;
	}

	.log {
		border-radius: 15px;
	}

	:global(body[data-bs-theme='light'] .fileBtn) {
		color: #000000;
	}

	:global(body[data-bs-theme='dark']) .log {
		box-shadow: 3px 3px 8px 4px rgba(0, 0, 0, 0.3);
	}

	:global(body[data-bs-theme='light']) .log {
		box-shadow: 3px 3px 8px 4px rgba(0, 0, 0, 0.2);
	}

	:global(body[data-bs-theme='dark']) .glass {
		background-color: rgba(68, 68, 68, 0.6) !important;
	}

	:global(body[data-bs-theme='light']) .glass {
		background-color: rgba(122, 122, 122, 0.6) !important;
		color: rgb(19, 19, 19);
	}

	.dateNumber {
		font-size: 3rem;
		font-weight: 600;
		font-style: italic;
		opacity: 0.5;
	}

	.dateDay {
		opacity: 0.7;
		font-size: 1.2rem;
	}

	.text {
		word-wrap: anywhere;
	}

	.text :global(h1) {
		font-size: 1.5rem;
	}

	.text :global(h2) {
		font-size: 1.25rem;
	}

	.text :global(blockquote) {
		font-style: italic;
		color: var(--bs-secondary-color);
		border-top: 1px solid var(--bs-border-color);
		border-bottom: 1px solid var(--bs-border-color);
		margin: 1rem 0;
		padding: 0.5rem 0.75rem;
	}

	.text :global(.spoiler-block) {
		margin: 1rem 0;
	}

	.text :global(.spoiler-content) {
		filter: blur(0.35rem);
		user-select: none;
		pointer-events: none;
	}

	.text :global(.spoiler-block[data-revealed='true'] .spoiler-content) {
		filter: none;
		user-select: auto;
		pointer-events: auto;
	}

	.logContent {
		width: 100%;
		flex-wrap: wrap;
		overflow-x: auto;
	}

	#scrollArea {
		padding-right: 0.5rem;
		overflow-y: auto;
		max-height: 100vh;
	}

	@media screen and (min-width: 576px) {
		.log {
			margin-left: 1rem;
			margin-right: 1rem;
		}
	}

	@media (max-width: 768px) {
		.date {
			min-width: 50px;
			flex-direction: row !important;
			align-items: end !important;
		}

		.dateDay {
			margin-left: 1rem;
		}

		.dateNumber {
			margin-top: -0.5rem;
			margin-bottom: 0;
		}

		.dateMonthYear {
			margin-left: 1rem;
			opacity: 0.7;
		}

		.log {
			flex-direction: column !important;
			margin-left: 1rem !important;
			margin-right: 0.5rem !important;
		}

		#scrollArea {
			margin-right: 0.5rem !important;
		}

		.layout-read {
			padding-right: 0 !important;
			padding-left: 0 !important;
		}
	}

	@media (min-width: 769px) {
		.date {
			min-width: 100px;
		}

		.dateMonthYear {
			display: none;
		}
	}
</style>
