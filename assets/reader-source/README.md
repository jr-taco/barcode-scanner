# Browser reader source

Source of `../decoder.js`, revision `browser_white100_native_media_v4`. Frozen neural parameters, original print center/hard-five/p=4 and cross-path candidate rules are retained.

Print ROI pixels are copied with `copyTo` to obtain packed rows; OpenCV/Embind handle `clone()` does not make the ROI data contiguous. Public ZXing detection uses the frozen Python BGR interpretation for the public-only view, and repeats detection inside the crop. Hidden sampling retains original RGB.

Supported ordinary MOV/MP4 uses native stts/ctts presentation times, nearest original PTS with earlier tie, and exact quarter-turn tkhd matrices. Actual provided frame times must match; failed frames are not replaced. Native limited-range NV12/I420 planes use the FFmpeg-compatible RGB table convention. Unsupported container edits/pixel formats/browser APIs retain a separately recorded browser-canvas fallback, which does not claim pixel parity.

Build from `engine.js` with esbuild (browser ES2022 bundled ESM) and zxing-wasm/reader. OpenCV loads from the page; ZXing/BCH WASM, covers and frozen weights remain in parent assets. See MEDIA_NOTICE.md and COPYING.MEDIA.LGPL-2.1.txt for the new conversion, and ../bch-source/ for the existing GPL component.

Same video frames and multiple sampling paths are not independent presence evidence. Recovery remains an unconfirmed candidate (accepted=false), and blank rejection/invisibility/standard quality remain separate. No captures, fixtures or expected messages are included in this source.
