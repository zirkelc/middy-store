---
"middy-store": patch
---

Fix `RangeError: Invalid string length` in the after-hook for huge outputs. With `minSize: Sizes.ZERO`, the size of the full output is no longer calculated. If an output is too large to stringify, its size falls back to the V8 max string length (~512MB) instead of throwing.
