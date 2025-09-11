# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of astro-github-loader
- GitHub repository content loading for Astro content collections
- Support for Starlight documentation sites
- Asset detection and automatic download from GitHub repositories
- Asset reference transformation in markdown content
- Content caching with ETag support for efficient updates
- Directory clearing functionality for clean imports
- Configurable file extension patterns for asset processing
- Support for both `.md` and `.mdx` file formats
- Recursive directory traversal for complete repository content

### Features
- **Content Loading**: Load markdown files from any GitHub repository into Astro content collections
- **Asset Management**: Automatically detect, download, and transform image references in markdown
- **Caching**: Built-in ETag-based caching to avoid unnecessary downloads
- **Path Transformation**: Flexible path mapping with `replace` and `basePath` options
- **Clean Imports**: Optional directory clearing to ensure fresh content on each import
- **Starlight Integration**: Seamless integration with Astro Starlight documentation sites

### Configuration Options
- `owner`: GitHub repository owner
- `repo`: GitHub repository name  
- `ref`: Git reference (branch, tag, or commit)
- `path`: Directory within the repository to load
- `replace`: String to remove from file paths
- `basePath`: Local directory for content files
- `assetsPath`: Local directory for downloaded assets
- `assetsBaseUrl`: URL prefix for asset references
- `assetPatterns`: File extensions to treat as assets
- `clear`: Whether to clear directories before importing

### Technical Details
- Built with TypeScript for full type safety
- Uses GitHub's REST API via Octokit
- Integrates with Astro's content loader system
- Supports concurrent file processing for performance
- Includes comprehensive error handling and logging

## Notes

This project was created during the [2025 Algorand Developer Retreat](https://github.com/Algorand-Developer-Retreat) to help manage developer documentation in the Algorand/AlgoKit ecosystems.