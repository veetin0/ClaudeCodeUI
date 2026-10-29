/** App commands, triggered from the native menu, the command palette or notifications. */
export type CommandId =
  | 'new-session'
  | 'close-session'
  | 'home'
  | 'view-chat'
  | 'view-agents'
  | 'view-preview'
  | 'hackathon'
  | 'toggle-panel'
  | 'toggle-terminal'
  | 'new-terminal'
  | 'new-claude-terminal'
  | 'focus-mode'
  | 'settings'
  | 'palette'
  | 'replay'
  | 'interrupt'
  | 'handoff'
  | 'usage'
  | 'pick-element'

/** A command plus an argument (e.g. which session a notification is about). */
export type CommandMessage = { id: CommandId } | { id: 'select-session'; sessionId: string }
