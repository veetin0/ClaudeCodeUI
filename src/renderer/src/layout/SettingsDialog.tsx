import { Settings } from 'lucide-react'
import { useApp } from '@/stores/app'
import { Segmented } from '@/ui/Segmented'
import { Sheet } from '@/ui/Sheet'
import { AdvancedTab } from './settings/Advanced'
import { GeneralTab } from './settings/General'
import { TeamTab } from './settings/Team'
import { ToolsTab } from './settings/Tools'

/** Settings in four tabs: General, Team, Tools (one switch each), Advanced. */
export function SettingsDialog() {
  const { settingsOpen, setSettingsOpen, settings, settingsTab } = useApp()
  if (!settingsOpen || !settings) return null
  return (
    <Sheet
      title="Settings"
      icon={<Settings className="size-4 text-muted" />}
      onClose={() => setSettingsOpen(false)}
      header={
        <Segmented
          label="Settings"
          value={settingsTab}
          onChange={(tab) => setSettingsOpen(true, tab)}
          options={[
            { id: 'general', label: 'General' },
            { id: 'team', label: 'Team' },
            { id: 'tools', label: 'Tools' },
            { id: 'advanced', label: 'Advanced' },
          ]}
        />
      }
    >
      <div className="px-5 py-4">
        {settingsTab === 'general' ? <GeneralTab /> : settingsTab === 'team' ? <TeamTab /> : settingsTab === 'tools' ? <ToolsTab /> : <AdvancedTab />}
      </div>
    </Sheet>
  )
}
