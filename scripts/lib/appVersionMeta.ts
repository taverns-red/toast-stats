/**
 * Red stub (#3000): adds no tag yet.
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
  _version: string | undefined
): AppVersionMetaPlugin {
  return { name: 'app-version-meta', transformIndexHtml: () => [] }
}
