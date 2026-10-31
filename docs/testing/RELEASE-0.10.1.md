# Video Vision 0.10.1 verification

The only runtime change normalizes rounded negative zero to positive zero in `lib/audio.js`. It does not disable audio analysis or alter precision.

- Regression coverage: peak/RMS/timeline, positive and negative full scale, silence, low amplitude, the one-decimal dB rounding boundary, and 30/60-second signals.
- Real video: publicly fetched separate video/audio tracks; original code reproduced negative-zero rejection on both approximately 30-second and 60-second PCM ranges. Patched complete `audio` and `watch` results passed the official `snapshotJsonValue` component from deepseek-ai/deepseek-harness commit `ce7073d51254c26cd63b22a60835b8f948deb447`. Serialized analysis measurements otherwise matched exactly.
- `watch` with a 60-second requested visual range still automatically analyzes only 30 seconds by design. The 60-second audio range was tested separately with `action=audio`.
- Source regression suite: 46 passed; the optional installed-host pruner check was not run because its module was not supplied. The historical authorization-isolation test uses repository history.
- This is cloud/component validation, not a claim of installed desktop GUI acceptance or speech-recognition quality. No browser credentials were required. Cross-platform behavior remains subject to the prior release's documented limitations.

The release workflow verifies the exact frozen package archive and all payload hashes before publication. Public release assets include SHA-256 checksums.
