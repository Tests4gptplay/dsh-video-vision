# Candidate.5 verification

Actual npm pack tarball unpacked; all 46 packaged files byte-match current source. Package metadata is 0.10.0-candidate.5; local Markdown targets checked. SHA-256: `4e506765304447c68f8ec85115d43d99cc17ca5928e9f9a23b9beffd39d4203a`; 89226 bytes.

10 distinct scripts executed against unpacked runtime: open-refresh, cache-refresh-transaction, audit-source-resolution, smoke, audit-budget-recovery, cache, audit-cache-recovery, audio, audit-audio-tail, ui-locale. All passed. The budget script contains 10 subtests, not 10 extra suites.

New tests exercise actual engine/resolver subprocesses with synthetic media/probe and controlled filesystem failure injection. Partial journal writes, journal publication failure, interrupted switch recovery, rollback failure, postcommit cleanup failure, unsupported hard links, corrupt/missing old media progress and cancellation are covered. Independent review reproduced two defects before fixes and verified final rename-based fixes.

No real browser credentials, user-machine operations or paid models. These results do not establish Windows/removable-filesystem refresh acceptance. Prior candidate.4 user viewing results are not counted as candidate.5 refresh acceptance. Package tests were run using externally installed dependencies; test files and fixtures are not packaged.
