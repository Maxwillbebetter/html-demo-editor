import { cp, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';

const CSS_URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi;
const SKIPPED_REFERENCE_RE = /^(?:[a-z][a-z\d+.-]*:|\/\/|#|data:|blob:|mailto:|tel:|javascript:)/i;

export function normalizeAssetPath(assetPath: string): string | null {
  const withoutQuery = assetPath.trim().replaceAll('\\', '/').split('#')[0].split('?')[0].trim();
  if (!withoutQuery || SKIPPED_REFERENCE_RE.test(withoutQuery)) return null;

  const stripRootSlash = (value: string) => {
    let output = value.replace(/^\/+/, '');
    while (output.startsWith('./')) output = output.slice(2);
    return output;
  };

  let clean = stripRootSlash(withoutQuery);
  try {
    clean = decodeURIComponent(clean);
  } catch {
    // Keep the original path if the source contains a malformed escape sequence.
  }

  clean = stripRootSlash(clean.replaceAll('\\', '/'));
  if (!clean || clean.includes('\0')) return null;
  return clean;
}

export function collectCssAssetPaths(css: string): string[] {
  const paths = new Set<string>();
  for (const match of css.matchAll(CSS_URL_RE)) {
    const normalizedPath = normalizeAssetPath(match[1] ?? match[2] ?? match[3] ?? '');
    if (normalizedPath) paths.add(normalizedPath);
  }

  return [...paths];
}

export async function copyReferencedAssets(
  sourceBaseDir: string | undefined,
  outputDir: string,
  assetPaths: string[] | undefined
): Promise<void> {
  if (!sourceBaseDir || !assetPaths?.length) return;

  const sourceRoot = resolve(sourceBaseDir);
  const copiedSources = new Set<string>();

  async function copyAsset(assetPath: string, fromDir: string): Promise<void> {
    const normalizedAsset = normalizeAssetPath(assetPath);
    if (!normalizedAsset) return;

    const source = resolve(fromDir, normalizedAsset);
    const relativeSource = relative(sourceRoot, source);
    if (relativeSource === '' || relativeSource.startsWith('..') || isAbsolute(relativeSource) || resolve(source) === sourceRoot) return;

    const sourceKey = resolve(source);
    if (copiedSources.has(sourceKey)) return;
    copiedSources.add(sourceKey);

    try {
      const assetStat = await stat(source);
      if (!assetStat.isFile()) return;

      const target = join(outputDir, normalize(relativeSource));
      if (resolve(source) !== resolve(target)) {
        await mkdir(dirname(target), { recursive: true });
        await cp(source, target, { force: true });
      }

      if (extname(source).toLowerCase() === '.css') {
        const css = await readFile(source, 'utf8');
        await Promise.all(collectCssAssetPaths(css).map((cssAssetPath) => copyAsset(cssAssetPath, dirname(source))));
      }
    } catch {
      // Missing references should not block saving or exporting the editable HTML.
    }
  }

  await Promise.all(Array.from(new Set(assetPaths)).map((assetPath) => copyAsset(assetPath, sourceRoot)));
}
