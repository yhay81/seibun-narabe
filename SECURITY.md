# Security

Security reports can be filed privately through GitHub's security advisory feature for `yhay81/seibun-narabe`.

- The telemetry endpoint accepts same-origin JSON POST requests only and size-limits request bodies.
- Telemetry event names are allowlisted; food IDs, queries, amounts, and nutrient values are absent from its schema.
- Official food data is a static asset with no runtime upstream dependency.
- Search and comparison state remain in browser local storage.
- DOM additions use `textContent`; no supplied value is interpreted as markup or code.
- Content Security Policy blocks third-party scripts, framing, and unnecessary browser capabilities.
