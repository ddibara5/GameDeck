// Local browser regression fixture. All network responses are intercepted by
// repro/artwork-loading.mjs; this fixture never signs in or writes user data.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import Cover from '../../src/components/Cover.jsx'
import HomeTab from '../../src/components/HomeTab.jsx'
import { homePreviewKey, rememberHomePreview } from '../../src/lib/homePreviewCache.js'
import RankingsTab from '../../src/components/RankingsTab.jsx'
import { warmRankingArtwork } from '../../src/lib/rankingArtwork.js'
import { warmCover } from '../../src/lib/coverLoading.js'
import '../../src/index.css'

function Fixture() {
  const [view, setView] = useState('empty')
  const [source, setSource] = useState('https://images.igdb.com/igdb/image/upload/t_cover_big/fixture.jpg')
  window.artworkTest = {
    show: (next) => flushSync(() => setView(next)),
    source: (next) => flushSync(() => setSource(next)),
    warm: warmCover,
    warmRankings: warmRankingArtwork,
    seedHome: (snapshot) => rememberHomePreview(snapshot, homePreviewKey()),
  }
  return <main>
    {view === 'home' ? <HomeTab onOpenTab={() => {}} onOpenList={() => {}} newsUnread={false} /> : null}
    {view === 'rankings' ? <RankingsTab /> : null}
    {view === 'cover' ? <Cover src={source} title="Fixture" sizes="64px" priority /> : null}
    {view === 'repeat' ? <Cover src={source} title="Fixture" sizes="64px" /> : null}
    {view === 'offscreen' ? <div style={{ marginTop: 20000 }}><Cover src={source} title="Fixture" /></div> : null}
  </main>
}
createRoot(document.getElementById('root')).render(<Fixture />)
