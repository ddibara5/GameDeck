import { useState } from 'react'
import TabBar from './components/TabBar.jsx'
import LibraryTab from './components/LibraryTab.jsx'
import ActivityTab from './components/ActivityTab.jsx'
import InsightsTab from './components/InsightsTab.jsx'
import DiscoverTab from './components/DiscoverTab.jsx'

const TABS = ['library', 'activity', 'insights', 'discover']

export default function App() {
  const [activeTab, setActiveTab] = useState('library')

  return (
    <div className="app">
      <main className="app-main">
        {activeTab === 'library' && <LibraryTab />}
        {activeTab === 'activity' && <ActivityTab />}
        {activeTab === 'insights' && <InsightsTab />}
        {activeTab === 'discover' && <DiscoverTab />}
      </main>
      <TabBar active={activeTab} onChange={setActiveTab} tabs={TABS} />
    </div>
  )
}
