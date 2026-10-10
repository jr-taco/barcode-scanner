# Browser reader source

This is the source for `../decoder.js`, revision `browser_white100_sampling_consensus_v3`. It preserves the frozen neural parameters and the original print center/hard-five/p=4 outputs. Four fixed sampling paths are exposed separately: public geometry with/without horizontal calibration, each with/without quadratic illumination regression. Conflicting messages abstain; isolated candidates remain visible. These paths use the same five frames and are not independent presence evidence.

Build with esbuild (browser ES2022, bundled ESM) from `engine.js` to `../decoder.js`, using zxing-wasm/reader. OpenCV is loaded by the page; ZXing, BCH WASM, covers and weights remain in the parent assets directory. `bch-core.js` uses the native BCH implementation/source and GPL notices in `../bch-source/`. The source contains no capture files or expected messages.

The browser's media decoding is different from Python/PyAV. Cross-platform recovery and blank rejection remain uncalibrated. Compare all candidates with independently provided encoding records.
