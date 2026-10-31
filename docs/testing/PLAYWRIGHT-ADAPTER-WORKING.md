# Official extension adapter — work in progress

This local development snapshot is not a published candidate. It reuses the Microsoft Playwright extension from Chrome Web Store (ID `mmlmfjhmonkocbjadbfplnigmagldckm`); users install it and confirm connections themselves. No extension installation or real-account import was performed in these tests.

## Dependency boundary

The official `@playwright/mcp@0.0.83` distribution pins `playwright-core@1.64.0-alpha-1790635538000`. Video Vision pins that exact core version and calls its exported, but internal and non-stable, `tools.createBrowserWithInfo`. Public cookie-list output omits required cookie fields; storage-state output writes additional browser storage; the generic tool response path may inspect page snapshots/console. The narrow adapter instead calls the attached context's `cookies()` and uses the existing Video Vision encrypted snapshot and URL-filtered HTTP pipeline.

The official browser connection initializes an attached tab (including Page/Runtime/Log protocol domains); it is not a single Storage-only CDP command. Video Vision does not collect page console output, export storageState, or read a password database. Extension authorization applies to the browser context, not just the selected tab.

The official API implicitly binds a control endpoint. A short-lived worker isolates its temporary registry using the pinned internal `PWTEST_SERVER_REGISTRY` variable, unbinds before collecting cookies, closes the transport, and removes only its own temporary directory before returning data. This variable is not a supported public integration contract. The temporary descriptor is sensitive control metadata; no claim of zero temporary files is made. Cookie values travel only through process memory/IPC, not logs, command-line arguments, or unencrypted files. Windows ACL behavior is not yet validated on Windows.

## Current validation boundaries

- Synthetic unit tests cover field fidelity, cancellation, late IPC, environment isolation, explicit selected-profile checks, and sanitized errors.
- Real pinned official relay/WS/CDP/context-cookie code was exercised with a synthetic extension and intercepted browser spawn. Unix bind is an explicit test double in the successful protocol tests. Normal capture, no attached tab, and disconnect before initialization were tested.
- Full real Unix bind hit execution-environment EPERM. An approved execution attempt failed during environment initialization; no restrictions were disabled or bypassed. This remains unverified, not passed.
- UI VM tests cover installation states and explicit checks without background polling. The actual React component HTML uses synthetic state; it is not DSH-host or real-extension proof.
- Local normal-sandbox Firefox launch timed out after 180 seconds with renderer/cache environment errors. No UI screenshot was produced. A single-page same-process HTTP self-check returned 200; the actual component HTML was provided for preview instead.

## Browser-confirmed source identity

Omitting both profile and executable makes the official helper search profiles. Providing the selected Chrome executable while omitting profile arguments avoids that search and opens the browser's extension confirmation page. The handshake does not supply a stable profile identity. A browser-confirmed save slot must not be represented as a verified physical profile or automatically inherit another source's snapshot. No Default profile should be silently assumed to be the user's daily Chrome.

The ordinary entry is now an explicit “Google Chrome (confirm in browser)” save slot. Discovery checks only known Chrome application executable paths, without a Default/profile assumption. The import worker receives an absolute executable and no profile fields. Synthetic real-official-module validation asserts no profile readFile/readdir before opening the confirmation URL, and no user-data-dir/profile-directory launch flags. Existing CDP-specific saved sources remain separate.

When the physical profile is unknown, installation status remains unknown and does not block import. Successful extension capture supplies connection evidence for the current session; a subsequent explicit check may return unknown again. The store action opens the official page in detected Chrome, does not install anything, and does not mark installation complete.

Partitioned cookies continue to be excluded by the existing common snapshot normalization, because Video Vision's ordinary HTTP requests do not reproduce a browser's partition context. Adapter field fidelity is tested before this intentional shared filter; no claim is made that every browser cookie is replayable by HTTP.

## Current local verification (2026-10-30)

`VV_OFFICIAL_PRUNER=<installed official pruner lib/index.js> node test/run-all.mjs`: 41 suites passed, zero skipped/not-run. The official pruner dependency is version 0.0.1-rc.3; this is component integration, not a DSH rc5 GUI result.

`VV_PLAYWRIGHT_CORE_PATH=<installed pinned core> node test/playwright-capture.mjs --official-mock-bind --browser-confirmed`: passed; repeated with `--no-tab` and `--disconnect-before-initialized`, both passed their expected rejection assertions. These three protocol scenarios are not three additional full-suite runs. `git diff --check` passed.

No new candidate archive has been frozen or published for this adapter work. Existing candidate.2 bytes are unchanged. Production archive unpacking and real-host verification remain separate work.

## Explicit cancellation

While import or refresh waits for browser approval, the UI keeps a Cancel import action available. Its dedicated RPC cancels only import controllers, preserves authorization and existing snapshots, and does not terminate Chrome or close user tabs. Pending imports waiting for initial authorization-file persistence are invalidated too. Extension cancellation waits for worker close/private temporary cleanup; cleanup failures remain visible rather than being reduced to a generic cancellation. Traditional CDP late-result protection is unchanged. No artificial approval timeout or background polling was introduced.

Synthetic regressions cover waiting capture cancellation, preserved readable old snapshot, ignored late capture result, subsequent explicit retry, and deferred cleanup success/failure. The independent reviewer additionally exercised actual worker/official relay cancellation while a synthetic Chrome never completed the extension handshake; worker termination and temporary-directory cleanup passed. This does not constitute a real browser-extension permission test.

The no-confirmation worker cancellation scenario is now a persistent suite, `test/playwright-no-confirm-cancel.mjs`, and is included in the 41-suite aggregate. Its 15-second test watchdog fails the test if hit; it is not a production import timeout.
