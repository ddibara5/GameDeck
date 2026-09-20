import { useState } from 'react'
// SegmentedControl is built by the filter-primitives worker (area: shared
// filter primitives). Expected contract mirrors the pilot's SegmentedControl:
// { label, options: [{ value, label }], value, onChange }.
import SegmentedControl from './SegmentedControl.jsx'
import ForYouTab from './ForYouTab.jsx'
import DiscoverTab from './DiscoverTab.jsx'
import NewsTab from './NewsTab.jsx'
import LibraryTab from './LibraryTab.jsx'
import WishlistTab from './WishlistTab.jsx'
import RankingsTab from './RankingsTab.jsx'
import ActivityTab from './ActivityTab.jsx'
import InsightsTab from './InsightsTab.jsx'
import './featureHub.css'

// Port of the Expo pilot's FeatureHub (Sept 10 commit, "Improve recommendations
// and streamline GameDeck navigation and filters"). Groups related screens
// under one hub with a segmented control: only the selected section mounts,
// so hidden collections do not fetch or render.
//
// The pilot drove selection from the route's `section` param; the PWA has no
// router, so selection is local state (initialSection overrides the default).
// Wiring this into the tab bar / drawer is the nav worker's call; this file
// only provides the component.
const SECTIONS = {
  discover: [
    { value: 'for-you', label: 'For You', Screen: ForYouTab },
    { value: 'browse', label: 'Browse', Screen: DiscoverTab },
    { value: 'news', label: 'News', Screen: NewsTab },
  ],
  library: [
    { value: 'games', label: 'Games', Screen: LibraryTab },
    { value: 'wishlist', label: 'Wishlist', Screen: WishlistTab },
    { value: 'rankings', label: 'Rankings', Screen: RankingsTab },
  ],
  activity: [
    { value: 'history', label: 'History', Screen: ActivityTab },
    { value: 'insights', label: 'Insights', Screen: InsightsTab },
  ],
}

export default function FeatureHub({
  kind,
  initialSection,
  onAsk,
  onBrowse,
  onCustomize,
  onWishlistClose,
  onOpenTaste,
}) {
  const options = SECTIONS[kind] || SECTIONS.discover
  const isValid = (value) => options.some((option) => option.value === value)
  const [selected, setSelected] = useState(
    isValid(initialSection) ? initialSection : options[0].value,
  )
  const match = options.find((option) => option.value === selected) || options[0]
  const { Screen } = match

  // Tab prop threading: each screen only receives the callbacks it declares.
  const screenProps = {}
  if (Screen === ForYouTab) {
    if (onAsk) screenProps.onAsk = onAsk
    if (onBrowse) screenProps.onBrowse = onBrowse
    if (onOpenTaste) screenProps.onOpenTaste = onOpenTaste
  } else if (Screen === DiscoverTab) {
    if (onCustomize) screenProps.onCustomize = onCustomize
    if (onAsk) screenProps.onAsk = onAsk
  } else if (Screen === WishlistTab) {
    // WishlistTab is a "view" that renders a back button calling onClose;
    // inside a hub there is nowhere to go back to, so default to a no-op.
    screenProps.onClose = onWishlistClose || (() => {})
  }

  return (
    <div className="fhub">
      <div className="fhub-seg">
        <SegmentedControl
          label={`${kind} sections`}
          options={options}
          value={selected}
          onChange={setSelected}
        />
      </div>
      <Screen key={selected} {...screenProps} />
    </div>
  )
}

export function DiscoverHub(props) {
  return <FeatureHub kind="discover" {...props} />
}

export function LibraryHub(props) {
  return <FeatureHub kind="library" {...props} />
}

export function ActivityHub(props) {
  return <FeatureHub kind="activity" {...props} />
}
