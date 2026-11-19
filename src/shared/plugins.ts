/** Which copy of a bundled plugin sessions get: the one built into Harness, or an installed newer one. */
export interface BundledPluginInfo {
  source: 'builtin' | 'installed' | 'none'
  version?: string
  builtinVersion?: string
  installedVersion?: string
  /** Folder passed to the SDK (built-in copy only). */
  path?: string
}
