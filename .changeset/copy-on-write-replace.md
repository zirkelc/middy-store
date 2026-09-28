---
"middy-store": minor
---

The middleware no longer mutates the event passed to the handler or the response returned by the handler. When a reference is replaced by its loaded payload (or a payload by its reference), only the objects and arrays along that path are shallow copied, and the result is assigned to `request.event` / `request.response`. Before, the caller's objects were changed in place, so a caller that kept a reference to an array of references (for example, a batch in a durable map) held every loaded payload in memory afterwards.

Behavior change: code that keeps a reference to the original event or to a nested object in it, and reads it after the middleware ran, now sees the original references and not the loaded payloads. The same applies to the object a handler returns. Read the loaded values from the event the handler receives, and the stored references from the response of the middy handler. `replaceByPath` is also exported, and it now returns a new root instead of mutating `source`.

The copies keep the prototype and all own properties (including accessors and extra properties on arrays), but private class fields (`#field`) cannot be copied. This only matters if the stored path of the output goes through a class instance with private fields. A reference that the input reaches by more than one path (a shared object) is now loaded and deleted only once.
