# 0.10.0-candidate.3 — Chrome extension import candidate

This is a test-branch candidate, not a marketplace release or proof of real-machine acceptance.

## User-visible changes

- Microsoft’s official Chrome extension installation page, with installation evidence kept separate from connection permission.
- Explicit “Google Chrome (confirm in browser)” save slot. No assumed Default profile, no profile enumeration, no background installation polling. The browser asks the user to confirm the connection. Re-import updates that selected VV save slot; automatic physical-profile isolation is not claimed.
- A usable Cancel import action while awaiting approval or collecting cookies. It preserves prior snapshots and authorization; extension worker cleanup completes before the operation settles, and cleanup failures remain visible.
- Existing explicit browser endpoints remain supported. Both paths use the same encrypted snapshot, URL cookie filtering, and VV HTTP implementation. Source browsers may be closed after import; site expiry/revocation still applies.

Online video from multiple sites, local files, reusable site methods, frames/audio, subtitles/ASR, continuation, media caching and export remain available. Site names such as Bilibili and YouTube are examples, not a restriction of the plugin’s scope. Anonymous resolver subprocesses remain anonymous.

## Verification

Source aggregate: 41 suites passed with the installed official Host pruner component. This includes actual worker/official relay cancellation before a synthetic extension confirms. Three additional protocol scenarios exercise the pinned official core against a synthetic extension: normal capture, no attached tab, and disconnect before initialization. Those protocol scenarios substitute Unix bind IO, explicitly; full real bind remains unverified in this cloud environment.

Packed-runtime results and exact package inventory/hash are recorded in `test-artifacts/unified-0.10.0-candidate.3/` after the production archive is unpacked and tested. Source passes are not substituted for archive results.

## Not yet verified

Real Chrome Web Store installation, extension permission UI and authenticated import; Windows Credential Manager and real OS keyring lifecycle; cross-restart encrypted snapshot use on the user’s machine; actual DSH settings UI. No real account secrets were collected in this round. The HTML preview is the actual React component with synthetic data, not a DSH-host screenshot. Candidate.3 does not silently convert old Electron safeStorage ciphertext or revive old hooks/IPC.

DSH rc5 installation/upgrade instructions in README were checked against official GUI behavior and an independent Web-profile installation test. Desktop upgrades use the new candidate source in the same package/address field, preserving configuration; only an explicit host prompt calls for uninstall/reinstall of that plugin entry, without deleting settings, snapshots or media caches; no `--profile desktop` CLI command is prescribed.

For internal adapter/version/protocol boundaries, see [technical working record](PLAYWRIGHT-ADAPTER-WORKING.md). The standalone legacy-exit fix1 remains unchanged and is not part of the main runtime archive; users who already completed it do not repeat it merely to test this candidate.
