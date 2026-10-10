# Barcode Scanner

Public browser-only reader at https://jr-taco.github.io/barcode-scanner/ . The user explicitly authorized publishing the decoder and frozen parameters on 2026-10-09. OpenCV and ZXing assets, carrier layout and frozen weights are included under assets/. No operator computer connection is required.

Photos, playable short videos and references are processed in the visitor browser; files and results are not uploaded or automatically retained. Download reports before closing. HEIC and video codec availability depends on the browser. Browser video sampling requests the fixed middle ±0.25/±0.125/0 second frames and records actual media times; this is distinct from the Python nearest-PTS media adapter. Missing/duplicate frames never get replaced.

The existing white100 original layout is supported. Print videos retain center, hard-five and the fixed p=4 cascade separately. Known messages, known blanks and independently read original electronic images are compared only after capture decoding. All hidden outputs remain unconfirmed candidates (accepted=false); blank rejection is uncalibrated.

2026-10-10: the complete five sampled frame results, actual times and correction counts are displayed. Additional public-only sampling paths and polynomial illumination compensation are diagnostic outputs; their cross-path agreement is separate from the preserved original results. Conflicting/isolated messages are retained, and known-blank comparison marks any candidate evidence as a false candidate even when cross-path selection abstains. This release does not claim stable recovery or calibrated blank rejection. Human-readable decoder source is in `assets/reader-source/`.

Build/verification sources are maintained in the local browser_embed_20261009 development directory. Third-party notices accompany assets. Model assets are frozen existing delivery parameters; the independent fusion research branch is not part of this website update.
