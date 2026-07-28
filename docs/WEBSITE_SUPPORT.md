# Website Support Button

GitHub Markdown strips executable script tags, so use the normal Buy Me a Coffee link or badge in `README.md`.

For a separately hosted website that intentionally permits this third-party script, the owner-provided embed is:

```html
<script
  type="text/javascript"
  src="https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js"
  data-name="bmc-button"
  data-slug="DustinS"
  data-color="#FFDD00"
  data-emoji=""
  data-font="Cookie"
  data-text="Buy me a coffee at least!"
  data-outline-color="#000000"
  data-font-color="#000000"
  data-coffee-color="#ffffff"
></script>
```

## Security notes

- This script executes code from a third-party CDN.
- Do not embed it in the package, Pi extension, skill, tests, or privileged application views.
- A public website should use a restrictive Content Security Policy and consciously allow the exact CDN origin.
- Prefer the static link/badge when third-party JavaScript is unnecessary.
