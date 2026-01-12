# typst-gather smoke test

This test verifies that `quarto call typst-gather` correctly:

1. Auto-detects Typst template files from `_extension.yml`
2. Scans those files for `@preview` package imports
3. Downloads the packages to `typst/packages/` directory

## Test fixture

The `_extensions/test-format/` directory contains a minimal Typst format extension with:

- `_extension.yml` - Defines template and template-partials
- `template.typ` - Imports `@preview/example:0.1.0`
- `typst-show.typ` - A template partial (no imports)

## Manual testing

```bash
cd tests/smoke/typst-gather
quarto call typst-gather
```

This should create `_extensions/test-format/typst/packages/preview/example/0.1.0/`.

## Cleanup

To reset the test fixture:

```bash
rm -rf _extensions/test-format/typst/packages
```
