/** App commands, triggered from the native menu, the command palette or notifications. */
export type CommandId =
  | 'new-session'
  | 'close-session'
  | 'view-chat'
  | 'view-board'
  | 'view-mission'
  | 'view-preview'
  | 'view-hackforge'
  | 'event-mode'
  | 'toggle-terminal'
  | 'new-terminal'
  | 'new-claude-terminal'
  | 'focus-mode'
  | 'settings'
  | 'palette'
  | 'replay'
  | 'interrupt'

/** A command plus an argument (e.g. which session a notification is about). */
export type CommandMessage = { id: CommandId } | { id: 'select-session'; sessionId: string }
