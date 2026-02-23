<script>
	import { API_URL } from '$lib/APIurl.js';
	import axios from 'axios';
	import { parseMarkdown, spoilerRevealAction } from '$lib/markdown.js';
	import ImageViewer from '$lib/ImageViewer.svelte';
	import Datepicker from '$lib/Datepicker.svelte';
	import { cal, selectedDate } from '$lib/calendarStore.js';
	import { alwaysShowSidenav, sameDate } from '$lib/helpers.js';
	import * as bootstrap from 'bootstrap';
	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import { getTranslate, getTolgee } from '@tolgee/svelte';

	const { t } = getTranslate();
	const tolgee = getTolgee(['language']);

	let token = $derived(page.params.token);

	let logs = $state([]);
	let searchQuery = $state('');
	let sharedSearchResults = $state([]);
	let offcanvasEl = $state(null);
	let isSearchingShared = $state(false);
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

	function scrollToDay(day, behavior = 'auto') {
		const el = document.querySelector(`.log[data-log-day="${day}"]`);
		if (el) {
			el.scrollIntoView({ behavior, block: 'start' });
		}
	}

	function scrollToTodayIfCurrentMonth(year, month) {
		const today = new Date();
		if (year !== today.getFullYear() || month !== today.getMonth()) {
			return;
		}

		requestAnimationFrame(() => {
			scrollToDay(today.getDate(), 'smooth');
		});
	}

	// Re-load whenever month/year changes
	$effect(() => {
		// track both reactive values
		const _year = $cal.currentYear;
		const _month = $cal.currentMonth;
		const _token = token;
		if (_token) {
			untrack(() => {
				loadMonthForSharedReading(_year, _month);
			});
		}
	});

	$effect(() => {
		if ($selectedDate) {
			$cal.currentYear = $selectedDate.year;
			$cal.currentMonth = $selectedDate.month - 1;

			const el = document.querySelector(`.log[data-log-day="${$selectedDate.day}"]`);
			if (el) {
				el.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
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
		$cal.daysWithLogs = [];
		$cal.daysWithFiles = [];

		axios
			.get(API_URL + '/share/loadMonthForReading', {
				params: { token, year, month: month + 1 }
			})
			.then((response) => {
				logs = response.data.sort((a, b) => a.day - b.day);
				$cal.daysWithLogs = logs.map((log) => log.day);
				$cal.daysWithFiles = logs.filter((log) => (log.files?.length || 0) > 0).map((log) => log.day);

				const selectedMatchesMonth =
					$selectedDate && $selectedDate.year === year && $selectedDate.month === month + 1;

				if (selectedMatchesMonth) {
					requestAnimationFrame(() => {
						scrollToDay($selectedDate.day, 'smooth');
					});
				} else {
					scrollToTodayIfCurrentMonth(year, month);
				}
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
			await loadMonthForSharedReading($cal.currentYear, $cal.currentMonth);
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

	function toSharedDownloadUrl(rawUrl) {
		if (!rawUrl || !token) {
			return rawUrl;
		}

		try {
			const parsedUrl = new URL(rawUrl, window.location.origin);
			const normalizedPath = parsedUrl.pathname.replace(/\/+$/, '');
			const isLogsDownloadEndpoint =
				normalizedPath.endsWith('/logs/downloadFile') ||
				normalizedPath.endsWith('/api/logs/downloadFile');

			if (!isLogsDownloadEndpoint) {
				return rawUrl;
			}

			const uuid = parsedUrl.searchParams.get('uuid');
			if (!uuid) {
				return rawUrl;
			}

			const sharedDownloadUrl = new URL(`${API_URL}/share/downloadFile`);
			sharedDownloadUrl.searchParams.set('token', token);
			sharedDownloadUrl.searchParams.set('uuid', uuid);
			return sharedDownloadUrl.toString();
		} catch {
			return rawUrl;
		}
	}

	function parseSharedMarkdown(markdownText) {
		const html = parseMarkdown(markdownText);
		if (!html || typeof window === 'undefined') {
			return html;
		}

		const parser = new DOMParser();
		const documentFragment = parser.parseFromString(`<body>${html}</body>`, 'text/html');

		documentFragment.body.querySelectorAll('img[src]').forEach((img) => {
			const src = img.getAttribute('src');
			img.setAttribute('src', toSharedDownloadUrl(src));
		});

		documentFragment.body.querySelectorAll('a[href]').forEach((anchor) => {
			const href = anchor.getAttribute('href');
			anchor.setAttribute('href', toSharedDownloadUrl(href));
		});

		return documentFragment.body.innerHTML;
	}

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

	function bookmarkDay() {}

	async function performSharedSearch() {
		const query = searchQuery.trim();
		if (!query) {
			sharedSearchResults = [];
			return;
		}

		isSearchingShared = true;
		try {
			const response = await axios.get(API_URL + '/share/searchString', {
				params: {
					token,
					searchString: query
				}
			});

			sharedSearchResults = (response.data || []).map((result) => ({
				year: Number(result.year),
				month: Number(result.month),
				day: Number(result.day),
				text: result.text || ''
			}));
		} catch (error) {
			if (error.response?.status === 401) {
				isInvalidToken = true;
			} else if (error.response?.status === 403) {
				isVerificationRequired = true;
				isShareVerified = false;
			}
			console.error(error);
			sharedSearchResults = [];
		} finally {
			isSearchingShared = false;
		}
	}

	function closeOffcanvasIfOpen() {
		if (!offcanvasEl) return;
		const instance = bootstrap.Offcanvas.getOrCreateInstance(offcanvasEl);
		instance.hide();
	}

	function selectDateFromSearch(result) {
		$selectedDate = {
			year: result.year,
			month: result.month,
			day: result.day
		};
		closeOffcanvasIfOpen();
	}

	onMount(() => {
		offcanvasEl = document.getElementById('sharedSidenav');
	});
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
	<div class="offcanvas offcanvas-start p-3" id="sharedSidenav" tabindex="-1">
		<div class="offcanvas-header">
			<button
				type="button"
				class="btn-close"
				data-bs-dismiss="offcanvas"
				data-bs-target="#sharedSidenav"
				aria-label="Close"
			></button>
		</div>
		<div class="d-flex flex-column h-100">
			<Datepicker {bookmarkDay} />
			<br />
			<div class="search d-flex flex-column glass-shadow mb-2">
				<form
					onsubmit={(event) => {
						event.preventDefault();
						performSharedSearch();
					}}
					class="input-group"
				>
					<input
						bind:value={searchQuery}
						type="text"
						class="form-control"
						placeholder={$t('search.search')}
						aria-label={$t('search.search')}
					/>
					<button class="btn btn-outline-secondary glass" type="submit" id="search-button" disabled={isSearchingShared}>
						{#if isSearchingShared}
							<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
						{:else}
							{$t('search.search')}
						{/if}
					</button>
				</form>
				<div class="list-group flex-grow-1 glass">
					{#if sharedSearchResults.length > 0}
						{#each sharedSearchResults as result}
							<button
								type="button"
								onclick={() => selectDateFromSearch(result)}
								class="list-group-item list-group-item-action {sameDate($selectedDate, {
									year: result.year,
									month: result.month,
									day: result.day
								})
									? 'active'
									: ''}"
							>
								<div class="search-result-content">
									<div class="date">
										{new Date(result.year, result.month - 1, result.day).toLocaleDateString(
											$tolgee.getLanguage(),
											{ day: '2-digit', month: '2-digit', year: 'numeric' }
										)}
									</div>
									<div class="text">{@html result.text}</div>
								</div>
							</button>
						{/each}
					{:else}
						<span class="noResult">{$t('search.no_results')}</span>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<div class="layout-read d-flex flex-row justify-content-between container-xxl">
		{#if $alwaysShowSidenav}
			<div class="sidenav p-3">
				<div class="d-flex flex-column h-100">
					<Datepicker {bookmarkDay} />
					<br />
					<div class="search d-flex flex-column glass-shadow mb-2">
						<form
							onsubmit={(event) => {
								event.preventDefault();
								performSharedSearch();
							}}
							class="input-group"
						>
							<input
								bind:value={searchQuery}
								type="text"
								class="form-control"
								placeholder={$t('search.search')}
								aria-label={$t('search.search')}
							/>
							<button class="btn btn-outline-secondary glass" type="submit" id="search-button-desktop" disabled={isSearchingShared}>
								{#if isSearchingShared}
									<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
								{:else}
									{$t('search.search')}
								{/if}
							</button>
						</form>
						<div class="list-group flex-grow-1 glass">
							{#if sharedSearchResults.length > 0}
								{#each sharedSearchResults as result}
									<button
										type="button"
										onclick={() => selectDateFromSearch(result)}
										class="list-group-item list-group-item-action {sameDate($selectedDate, {
											year: result.year,
											month: result.month,
											day: result.day
										})
											? 'active'
											: ''}"
									>
										<div class="search-result-content">
											<div class="date">
												{new Date(result.year, result.month - 1, result.day).toLocaleDateString(
													$tolgee.getLanguage(),
													{ day: '2-digit', month: '2-digit', year: 'numeric' }
												)}
											</div>
											<div class="text">{@html result.text}</div>
										</div>
									</button>
								{/each}
							{:else}
								<span class="noResult">{$t('search.no_results')}</span>
							{/if}
						</div>
					</div>
				</div>
			</div>
		{/if}

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
			<div class="d-flex flex-column my-4 flex-fill overflow-y-auto" id="scrollArea">
				<div class="d-flex justify-content-between align-items-center mb-3 px-2">
					<div class="d-flex align-items-center gap-2">
						{#if !$alwaysShowSidenav}
							<button
								type="button"
								class="btn btn-secondary"
								data-bs-toggle="offcanvas"
								data-bs-target="#sharedSidenav"
							>
								☰
							</button>
						{/if}
						<span class="fw-semibold">📖 DailyTxT</span>
						<span class="badge bg-secondary">{$t('shareView.badge_read_only')}</span>
					</div>
				</div>

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
											{new Date($cal.currentYear, $cal.currentMonth, log.day).toLocaleDateString($tolgee.getLanguage(), { weekday: 'long' })}
										</b>
									</p>
									<p class="dateMonthYear">
										<i>{new Date($cal.currentYear, $cal.currentMonth, log.day).toLocaleDateString($tolgee.getLanguage(), { year: 'numeric', month: 'long' })}</i>
									</p>
								</div>
								<div class="logContent flex-grow-1">
									{#if log.text && log.text !== ''}
										<div
											class="text"
											use:spoilerRevealAction={{
												warningText: $t('markdown.spoiler.click_again_warning'),
												revealWindowMs: 3000
											}}
										>
											{@html parseSharedMarkdown(log.text)}
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

	.sidenav {
		min-width: 385px;
		height: 100%;
	}

	#sharedSidenav {
		width: 385px;
		backdrop-filter: blur(8px);
	}

	.list-group-item-action {
		color: inherit !important;
	}

	.search {
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
		border-radius: 10px;
		min-height: 0;
	}

	.list-group {
		border-top-left-radius: 0;
		border-top-right-radius: 0;
		border-bottom-left-radius: 10px;
		border-bottom-right-radius: 10px;
		overflow-y: auto;
		min-height: 250px;
		flex: 1 1 auto;
		max-height: none;
	}

	.noResult {
		font-size: 25pt;
		font-weight: 750;
		text-align: center;
		padding-left: 0.5rem;
		padding-right: 0.5rem;
		margin-left: auto;
		margin-right: auto;
		margin-top: 2rem;
		user-select: none;
		border-radius: 10px;
	}

	:global(body[data-bs-theme='dark']) .noResult {
		color: #757575;
	}

	:global(body[data-bs-theme='light']) .noResult {
		color: #9b9b9b;
		background-color: #b8b8b879;
	}

	.search-result-content {
		display: flex;
		align-items: center;
	}

	#search-button,
	#search-button-desktop {
		border-bottom-right-radius: 10px;
		border-top-right-radius: 10px;
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

	.text :global(img) {
		max-width: 100%;
		height: auto;
		margin: 0.25rem 0;
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
		position: relative;
		cursor: pointer;
	}

	.text :global(.spoiler-content) {
		filter: blur(0.35rem);
		user-select: none;
	}

	.text :global(.spoiler-warning) {
		display: none;
		position: absolute;
		inset: 0;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 0.75rem;
		font-weight: 600;
		color: var(--bs-body-color);
		background-color: rgba(0, 0, 0, 0.15);
		border-radius: 0.375rem;
	}

	.text :global(.spoiler-block[data-armed='true'][data-revealed='false'] .spoiler-warning) {
		display: flex;
	}

	.text :global(.spoiler-block[data-revealed='true'] .spoiler-content) {
		filter: none;
		user-select: auto;
	}

	.text :global(.spoiler-block[data-revealed='true'] .spoiler-warning) {
		display: none;
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

	@media (max-width: 1599px) {
		.sidenav {
			display: none;
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

		#sharedSidenav {
			width: 95vw;
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
