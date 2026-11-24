# Try Puppy Tracker with fictional data

The practice demo uses the actual Journal, Growth and Care cards with a separate,
fictitious litter. You do not need a Home Assistant installation or account.
It is a local preview, not a published website.

## Open it

From a checkout of this repository, with Python 3 and npm available, run:

```sh
npm run demo
```

Open [the local demo](http://127.0.0.1:4173/demo/). Choose Nederlands or English.
The simplified preview works without an internet connection. Stop the local
server with Ctrl+C when finished. Do not open `index.html` directly: browsers
need HTTP to load its JavaScript modules.

## What to try

1. In **Journal → Quick log**, select a puppy and add a note.
2. Open **Dossier**, find that note, and edit it with the pencil.
3. Open **Care**, read an example ENS action, add an observation and save it.
   The action disappears from the pending list and appears in the puppy's dossier.
4. In **Calculator**, experiment with amounts or separate feeding portions.
5. Open **Growth** to explore the weight chart and collar-colour series.
6. Use **Reset demo** to restore the original litter. Reloading or changing
   language/preview also restarts the example; practice entries are discarded. Only this demo's remembered tab/filter choices
   are cleared by Reset; unrelated browser storage is left alone.

This is a focused demonstration. Real weighing-station controls, exports,
configuration, owner details and advanced comparison/projection calculations
are not simulated. Unsupported actions explain that they are unavailable.
Example care instructions and quantities are not a protocol or dosage advice.

## Home Assistant preview

**Home Assistant preview** uses the official
[Home Assistant embed components](https://contributors.home-assistant.io/frontend/custom-ui/demo/)
for native card rendering. It loads scripts and assets from
`https://demo.home-assistant.io`, so this optional mode requires internet.
Puppy Tracker commands are handled by the same fictional in-memory backend;
there is no connection to a live Home Assistant server. If the remote preview
cannot load, the page falls back to the simplified local preview.

## Data and isolation

`demo/backend.js` constructs a fictional litter and three puppies. It contains
no real contacts, private contract, breeder logo or production backup. It
implements only the demonstrated API operations and has no network, filesystem
or browser-storage access. Its mutations affect only that page's memory.
No authentication token or Home Assistant address is requested or accepted.

The demo lives outside the integration's frontend directory: installing the
integration does not install a public demo endpoint in Home Assistant. Serve it
separately as above. Publishing it elsewhere is a separate deployment decision.
The browser tests reuse this backend and exercise logging/editing, care, growth,
reset, remote-preview failure and the absence of external requests in local mode.

[English user manual](USER_MANUAL.md) · [Nederlandse handleiding](GEBRUIKERSHANDLEIDING.md)
