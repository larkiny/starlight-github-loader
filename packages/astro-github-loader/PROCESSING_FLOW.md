# Astro GitHub Loader - Content Processing Pipeline

This document provides a comprehensive overview of how content flows through the Astro GitHub Loader, from initial file discovery to final output in your Astro content collection.

## Overview

The Astro GitHub Loader processes content in four main phases:

1. **File Discovery and Collection** - Scan GitHub repository and identify files to import
2. **Individual File Processing** - Transform each file's content and determine target paths
3. **Global Link Transformation** - Resolve and transform links between imported files
4. **File Storage** - Write processed files to Astro content store

## Phase 1: File Discovery and Collection

### Step 1: Directory Scanning
- **Function**: `collectFilesRecursively()`
- **Input**: Include patterns from config
- **Process**: Recursively scans GitHub repo directories
- **Configuration Used**: `includes[].pattern` (glob patterns)
- **Output**: List of files matching include patterns

**Example**:
```typescript
// Configuration
includes: [{
  pattern: "docs/markdown/autoapi/algokit_utils/**/*",
  basePath: "src/content/docs/reference/algokit-utils-py/api"
}]

// Output
[
  "docs/markdown/autoapi/algokit_utils/index.md",
  "docs/markdown/autoapi/algokit_utils/applications/abi/index.md",
  "docs/markdown/autoapi/algokit_utils/applications/app_client/AppClient.md",
  // ...
]
```

### Step 2: File Content Fetching
- **Function**: `collectFileData()`
- **Process**: Downloads raw content from GitHub
- **Output**: Raw file content as string

## Phase 2: Individual File Processing

### Step 3: Asset Processing
- **Function**: `processAssets()`
- **Configuration Used**: `assetsPath`, `assetsBaseUrl`, `assetPatterns`
- **Process**: Downloads and transforms asset references (images, etc.)

**Example**:
```markdown
// Before asset processing
![Diagram](./diagram.png)

// After asset processing
![Diagram](@assets/imports/algokit-utils-py/diagram.png)
```

### Step 4: Path Mapping Application
- **Function**: `generatePath()`
- **Configuration Used**: `includes[].pathMappings`
- **Process**: Determines final target path for each file

**Examples**:
```typescript
// Configuration
pathMappings: {
  "docs/markdown/autoapi/algokit_utils/": "",
  "docs/markdown/index.md": "overview.md"
}

// Transformations
"docs/markdown/autoapi/algokit_utils/index.md"
→ "src/content/docs/reference/algokit-utils-py/api/index.md"

"docs/markdown/index.md"
→ "src/content/docs/algokit/utils/python/overview.md"
```

### Step 5: Content Transformations
- **Configuration Used**:
  - `transforms[]` (global transforms)
  - `includes[].transforms[]` (pattern-specific transforms)
- **Process**: Apply content transformation functions

**Examples**:
```typescript
// Transform functions
convertH1ToTitle: "# My Title" → frontmatter: {title: "My Title"}
removeH1: "# My Title\nContent..." → "Content..."

// Conditional transforms
createConditionalTransform(
  path => path.endsWith('README.md'),
  convertH1ToTitle
)
```

### Step 6: Build ImportedFile Objects
- **Output**: Array of `ImportedFile` objects with:
  - `sourcePath`: Original GitHub path
  - `targetPath`: Final destination path
  - `content`: Transformed content
  - `linkContext`: Metadata for link processing

## Phase 3: Global Link Transformation

### Step 7: Global Link Processing
- **Function**: `globalLinkTransform()`
- **Input**: All `ImportedFile` objects
- **Configuration Used**: `linkTransform.linkMappings`, `linkTransform.stripPrefixes`

This is the most complex phase, involving several sub-steps for each link in each file.

#### Step 7.1: Build Source-to-Target Map
Creates a lookup table mapping original GitHub paths to final target paths:

```javascript
sourceToTargetMap = new Map([
  ["docs/markdown/autoapi/algokit_utils/index.md", "src/content/docs/reference/algokit-utils-py/api/index.md"],
  ["docs/markdown/autoapi/algokit_utils/applications/abi/index.md", "src/content/docs/reference/algokit-utils-py/api/applications/abi/index.md"]
  // ...
]);
```

#### Step 7.2: Process Each Link in Each File

**For each markdown link `[text](url)` in each file, the following steps occur:**

##### Step 7.2.1: Apply Global Mappings
- **Configuration**: Mappings with `global: true`
- **Purpose**: Apply transformations that should affect all links globally

**Examples**:
```typescript
// Starlight compatibility - strips index.md for cleaner URLs
{
  pattern: /\/index(\.md)?$/,
  replacement: '/',
  global: true
}

// Path prefix transformations
{
  pattern: /^docs\/code\/(.+)$/,
  replacement: '/reference/algokit-utils-ts/api/$1',
  global: true
}

// Before: "../abi/index.md"
// After: "../abi/"
```

##### Step 7.2.2: Path Normalization
- **Function**: `normalizePath()`
- **Process**: Resolve relative paths (`../`, `./`) to full source paths

**Examples**:
```typescript
// Current file being processed
currentFile: "docs/markdown/autoapi/algokit_utils/applications/app_factory/SendAppCreateFactoryTransactionResult.md"

// Link after global mappings
linkUrl: "../abi/"

// Normalization process
currentDir = "docs/markdown/autoapi/algokit_utils/applications/app_factory"
normalized = path.posix.normalize(path.posix.join(currentDir, "../abi/"))
result = "docs/markdown/autoapi/algokit_utils/applications/abi/"
```

##### Step 7.2.3: Internal Link Resolution
- **Process**: Check if normalized path exists in `sourceToTargetMap`
- **If found**: Convert to Starlight URL using `pathToStarlightUrl()`
- **If not found**: Fall through to non-global mappings

**Examples**:
```typescript
// Success case
sourceToTargetMap.get("docs/markdown/autoapi/algokit_utils/applications/abi/index.md")
→ Found: "src/content/docs/reference/algokit-utils-py/api/applications/abi/index.md"
→ Starlight URL: "/reference/algokit-utils-py/api/applications/abi/"

// Failure case (our current bug)
sourceToTargetMap.get("docs/markdown/autoapi/algokit_utils/applications/abi/")
→ Not found (because map has "...abi/index.md", not "...abi/")
→ Falls through to non-global mappings
```

##### Step 7.2.4: Non-Global Mappings (Fallback)
- **Configuration**: Mappings with `global: false` (including context-aware rules)
- **Purpose**: Handle unresolved links with context-specific transformations

**Examples**:
```typescript
// Context-aware Python API rule
{
  contextFilter: context => context.sourcePath.startsWith('docs/markdown/autoapi/algokit_utils/'),
  relativeLinks: true,
  pattern: /.*/,
  replacement: (match) => `/reference/algokit-utils-py/api/${match}/`,
  global: false
}

// This rule processes the already-transformed "../abi/" link
// Result: "/reference/algokit-utils-py/api/../abi/" (incorrect!)
```

## Phase 4: File Storage

### Step 8: Store Processed Files
- **Function**: `storeProcessedFile()`
- **Process**: Write final content to Astro content store
- **Output**: Files available to Astro with transformed content and links

## Configuration Reference

### Include Patterns
```typescript
includes: [
  {
    pattern: "docs/**/*.md",           // Glob pattern for files to include
    basePath: "src/content/docs",      // Target directory
    pathMappings: {                    // Path transformations
      "docs/": "",
      "docs/README.md": "overview.md"
    },
    transforms: [                      // Content transformations
      convertH1ToTitle,
      removeH1
    ]
  }
]
```

### Link Transformations
```typescript
linkTransform: {
  stripPrefixes: ['src/content/docs'],  // Prefixes to remove from final URLs
  linkMappings: [
    // Global mappings (applied first)
    {
      pattern: /\/index\.md$/,
      replacement: '/',
      global: true
    },

    // Context-aware mappings (applied to unresolved links)
    {
      contextFilter: context => context.sourcePath.startsWith('docs/api/'),
      relativeLinks: true,
      pattern: /.*/,
      replacement: (match) => `/api/${match}/`,
      global: false
    }
  ]
}
```

## Common Issues and Debugging

### Link Resolution Problems

**Problem**: Links are not being transformed correctly or are missing.

**Debug Steps**:
1. Enable debug logging: `logLevel: 'debug'`
2. Check `[normalizePath]` debug messages to see path resolution
3. Verify your `sourceToTargetMap` includes the expected paths
4. Check if global mappings are interfering with path resolution

**Example Debug Output**:
```
[normalizePath] BEFORE: linkPath="../abi/index.md", currentFilePath="docs/markdown/autoapi/algokit_utils/applications/app_factory/SendAppCreateFactoryTransactionResult.md"
[normalizePath] RELATIVE PATH RESOLVED: "../abi/index.md" -> "docs/markdown/autoapi/algokit_utils/applications/abi/index.md"
```

### Path Mapping Issues

**Problem**: Files are not being placed in the correct target directories.

**Common Causes**:
- Incorrect glob patterns in `includes[].pattern`
- Missing or incorrect `pathMappings`
- Path mapping conflicts between different include patterns

### Asset Processing Issues

**Problem**: Images or other assets are not being downloaded or referenced correctly.

**Requirements**:
- Both `assetsPath` and `assetsBaseUrl` must be configured
- Asset file extensions must be included in `assetPatterns` (or use defaults)
- Local file system permissions must allow writing to `assetsPath`

## Performance Considerations

- **File Discovery**: Large repositories with many files will take longer to scan
- **Asset Processing**: Images and other assets are downloaded during processing
- **Link Resolution**: Complex link mapping configurations can slow down processing
- **Concurrent Processing**: The loader processes multiple configurations sequentially to avoid overwhelming GitHub's API

## Next Steps

For implementation details and API reference, see the main [README.md](README.md).

For specific configuration examples, see the `examples/` directory.