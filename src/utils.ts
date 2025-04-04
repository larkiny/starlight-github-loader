import path from 'path';
import { fileURLToPath } from 'node:url';
import { slug as githubSlug } from 'github-slugger';

export type ContentPaths = {
  root: URL;
  contentDir: URL;
  assetsDir: URL;
  typesTemplate: URL;
  virtualModTemplate: URL;
  config: {
    exists: boolean;
    url: URL;
  };
};
const isWindows =
  typeof process !== 'undefined' && process.platform === 'win32';
export function slash(path: string) {
  return path.replace(/\\/g, '/');
}
/**
 * Re-implementation of Vite's normalizePath that can be used without Vite
 */
export function normalizePath(id: string) {
  return path.posix.normalize(isWindows ? slash(id) : id);
}

function getRelativeEntryPath(entry: URL, collection: string, contentDir: URL) {
  const relativeToContent = path.relative(
    fileURLToPath(contentDir),
    fileURLToPath(entry),
  );
  return path.relative(collection, relativeToContent);
}
export function getContentEntryIdAndSlug({
  entry,
  contentDir,
  collection,
}: Pick<ContentPaths, 'contentDir'> & { entry: URL; collection: string }): {
  id: string;
  slug: string;
} {
  const relativePath = getRelativeEntryPath(entry, collection, contentDir);
  const withoutFileExt = relativePath.replace(
    new RegExp(path.extname(relativePath) + '$'),
    '',
  );
  const rawSlugSegments = withoutFileExt.split(path.sep);

  const slug = rawSlugSegments
    // Slugify each route segment to handle capitalization and spaces.
    // Note: using `slug` instead of `new Slugger()` means no slug deduping.
    .map(segment => githubSlug(segment))
    .join('/')
    .replace(/\/index$/, '');

  const res = {
    id: normalizePath(relativePath),
    slug,
  };
  return res;
}
/**
 * Convert a platform path to a posix path.
 */
export function posixifyPath(filePath: string) {
  return filePath.split(path.sep).join('/');
}

/**
 * Unlike `path.posix.relative`, this function will accept a platform path and return a posix path.
 */
export function posixRelative(from: string, to: string) {
  return posixifyPath(path.relative(from, to));
}