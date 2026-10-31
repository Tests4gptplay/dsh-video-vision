# Candidate.3 delivery verification

- Product: dsh-video-vision-0.10.0-candidate.3.tgz
- SHA-256: `178044e27ce60628cb6407242a31457d883eeaa707ad19804b47d11d93410a36`
- Bytes: 84152; packaged files: 45
- Source suites: 41 passed, zero not-run.
- Actual unpacked product suites: 40 passed. One standalone legacy-exit suite intentionally excluded from the main package and tested in the source aggregate. Test scripts are copied only into the verification directory; they are not installed product files. Dependencies are the pinned installed packages. Historical authorization fixture uses the exact cde7de6 Git baseline, not old runtime bundled into the product.
- Final user-facing README and package description correction after packed testing: all other 43 archive files byte-identical to tested archive 2ffbe78cd9ae12c988b572f1df1f7a5968dcbac2d6c979a2161e1def2f55c2b2. Package metadata differs only in description. Final archive entrypoints and new adapter imports passed; every packed Markdown link, manifest export and current version reference checked.
- Three real-official-module/synthetic-extension protocol scenarios passed, with Unix bind explicitly mocked. The actual-worker no-confirmation cancellation test is already counted in the aggregate, not added twice.
- No real extension installation, account capture, Windows/keyring or DSH GUI acceptance is claimed. See LOCAL-ACCEPTANCE.md for remaining machine checks.
- Previous candidate.2 and standalone legacy-exit fix1 are unchanged. No marketplace/main publication.

An initial packed harness run omitted the historical Git fixture path and failed that fixture setup; supplying its documented VV_LEGACY_TEST_SOURCE resolved it. This was not counted as a passed run.

Publication: test branch commit `4a186300c04dfac64365e9ad8aec667b9d40950b`, tree `80ba4460684522b566b7928b00b875017e71b0f6`. Anonymous fixed-commit TGZ download returned HTTP 200 and the exact SHA-256 above. Main remained `507d5874a2a27a7f01b8fa6e98679b6256dc2582`. No workflow runs/statuses were found for the commit; local tests are not GitHub CI.
