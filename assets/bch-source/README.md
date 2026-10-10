# Browser BCH build

Corresponding source for bch.wasm. bch.c and bch.h are unchanged from bchlib 2.1.3 (python-bchlib, https://github.com/jkent/python-bchlib); GPL-2.0-only, see COPYING. browser.c supplies the fixed m=7/t=5/poly=137 7-byte-data / 5-byte-ECC adapter and applies returned bit corrections exactly as the existing Python wrapper. The native library can produce a candidate on invalid inputs; this port preserves that behavior and does not treat it as presence validation.

Compile with Zig 0.14.1:

```sh
zig cc -target wasm32-wasi -mexec-model=reactor -O2 -Wl,--export=get_packet -Wl,--export=decode_packet -Wl,--export-memory bch.c browser.c -o ../bch.wasm
```

The first 96 MSB-first observed bits are packed into 12 bytes; the last four tail bits are not decoded, matching wire.py. Model initialization and file handling use the separate browser UI; there are no file uploads in this adapter.

Browser ABI initialization is memory-local; no hosted service or credentials are needed.
