# Native showcase verification

The Native site consumes the formal shared catalog and public browser SDK. Its acceptance entry under `acceptance/` runs the shared browser scenarios.

```sh
pnpm build:examples
pnpm --filter flowsvg-native-example typecheck
pnpm --filter flowsvg-native-example test:showcase
pnpm test:delivery
```

Run `pnpm test:examples` for the ordered three-host build and complete example verification. Prepare Chromium and system fonts before browser checks.

Verify all ten formal examples, playback, seeking, themes, reduced motion, direct addresses, sharing, history, player replacement and export cancellation. Check the copied root/subpath artifacts independently of the source checkout.

Shared author tests own narrative data. SDK tests own rendering, geometric and lifecycle behavior. Keep transient inspection logs and screenshots outside version control.
