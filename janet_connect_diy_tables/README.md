# Janet Connect DIY Tables

A client-facing page that shows an agency which Credible tables Janet Connect downloads to
their Janet DIY server.

The page reads
`https://raw.githubusercontent.com/mission-driven-data/janet/main/configuration.csv`
in the reader's browser and keeps the rows whose `DIY_Default` column is `TRUE`. That is the
same configuration the nightly run reads, so the page and the server cannot drift
apart. There is nothing to regenerate here
and no second copy of the list that can go stale.

## Files

- `index.html` — the full page, for someone opening it directly
- `embedded.html` — the iframe target, sized for a 720px frame
- `styles.css`
- `app.js`

All files are self-contained in `janet_connect_diy_tables/`. There is no build step.

## Behavior

- Two columns, Schema and Table, sorted by schema then table name.
- The table count and the time the list was read sit at the top of the page, so a reader knows
  how current the list is before they read it.
- **Download CSV** builds the file from the rows already on screen, so it cannot disagree with
  what is displayed.
- If the fetch fails, the page shows the reason in the status banner and renders no table at
  all. An empty table would read as a very short list, which is worse than an error. There is
  deliberately no bundled fallback copy of the list.

## Iframe embed

```html
<iframe
  src="https://mission-driven-data.github.io/PUBLIC/janet_connect_diy_tables/embedded.html"
  title="Janet Connect DIY tables"
  width="100%"
  height="720"
  style="border:0;border-radius:12px;"
  loading="lazy"
></iframe>
```

## Changing what is on the list

Edit the `DIY_Default` column in `configuration.csv` in the public `janet` repo. The page picks
the change up on its next load.
