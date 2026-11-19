import { Settings } from 'lucide-react'
import { useApp } from '@/stores/app'
import { Segmented } from '@/ui/Segmented'
import { Sheet } from '@/ui/Sheet'
import { AdvancedTab } from './settings/Advanced'
import { GeneralTab } from './settings/General'
import { ToolsTab } from './settings/Tools'
import { version } from '../../../../package.json'

/** Settings in three tabs: General, Tools (one switch each), Advanced. */
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
            { id: 'tools', label: 'Tools' },
            { id: 'advanced', label: 'Advanced' },
          ]}
        />
      }
    >
      <div className="px-5 py-4">
        {settingsTab === 'general' ? <GeneralTab /> : settingsTab === 'tools' ? <ToolsTab /> : <AdvancedTab />}
        <p className="num mt-4 text-center text-[11px] text-muted">Harness {version}</p>
      </div>
    </Sheet>
  )
}
