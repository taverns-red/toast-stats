/**
 * Writes the release version into index.html as
 * `<meta name="app-version" content="v…">` (#3000).
 *
 * `agent-cli live-version` used to find the version in the Vite env object,
 * which sat in whichever chunk happened to read `import.meta.env`: the entry,
 * then the cdnBase chunk (#2999, #3013). With the CDN a build-time constant,
 * no critical-path chunk reads it. A tag in the page can't move with the
 * chunking. deploy.yml sets `VITE_APP_VERSION`; preview and local builds don't,
 * so they get no tag.
 */

export interface HtmlTag {
  tag: string
  attrs: Record<string, string>
  injectTo: 'head'
}

export interface AppVersionMetaPlugin {
  name: string
  transformIndexHtml: () => HtmlTag[]
}

export function appVersionMetaPlugin(
  version: string | undefined
): AppVersionMetaPlugin {
  const content = (version ?? '').trim()
  return {
    name: 'app-version-meta',
    transformIndexHtml: () =>
      content === ''
        ? []
        : [
            {
              tag: 'meta',
              attrs: { name: 'app-version', content },
              injectTo: 'head',
            },
          ],
  }
}
