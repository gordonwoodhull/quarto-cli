# typst-gather

Gather Typst packages locally for offline/hermetic builds.

## Install

```bash
cargo install --path .
```

## Usage

```bash
typst-gather packages.toml
```

Then set `TYPST_PACKAGE_CACHE_PATH` to the destination directory when running Typst.

## TOML format

```toml
destination = "/path/to/packages"

[preview]
cetz = "0.4.1"
fontawesome = "0.5.0"

[local]
my-template = "/path/to/src"
```

- `destination` - Required. Directory where packages will be gathered.
- `[preview]` packages are downloaded from Typst Universe (cached - skipped if already present)
- `[local]` packages are copied from the specified directory (always fresh - version read from `typst.toml`)

## Features

- Recursively resolves `@preview` dependencies from `#import` statements
- Uses Typst's own parser for reliable import detection
- Local packages always overwrite (clean slate)
- Preview packages skip if already cached
