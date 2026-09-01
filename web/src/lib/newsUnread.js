import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

const SEEN_KEY = 'gamedeck_news_seen_stamp_v2'
const SEEN_EVENT = 'gd-news-seen'

export function getSeenStamp() {
  try {
    return localStorage.getItem(SEEN_KEY) || ''
  } catch {
    return ''
  }
}

export function markNewsSeen(stamp) {
  if (!stamp) return
  try {
    if ((localStorage.getItem(SEEN_KEY) || '') >= stamp) return
    localStorage.setItem(SEEN_KEY, stamp)
  } catch {
    // ignore storage failures
  }
  window.dispatchEvent(new Event(SEEN_EVENT))
}

export async function fetchLatestStamp() {
  const { data, error } = await supabase
    .from('news')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error || !data || !data.length) return ''
  return data[0].created_at || ''
}

export function newestStamp(rows) {
  let best = ''
  for (const row of rows || []) {
    const stamp = row.createdAt || ''
    if (stamp > best) best = stamp
  }
  return best
}

// Only tabs that can display the badge enable this hook. A profile that keeps
// News in the drawer no longer pays for a launch query whose result has nowhere
// to render.
export function useNewsUnread(enabled = true) {
  const [unread, setUnread] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setUnread(false)
      return undefined
    }
    let alive = true
    fetchLatestStamp().then((latest) => {
      if (alive) setUnread(Boolean(latest) && latest > getSeenStamp())
    })
    const onSeen = () => {
      if (alive) setUnread(false)
    }
    window.addEventListener(SEEN_EVENT, onSeen)
    return () => {
      alive = false
      window.removeEventListener(SEEN_EVENT, onSeen)
    }
  }, [enabled])

  return unread
}
