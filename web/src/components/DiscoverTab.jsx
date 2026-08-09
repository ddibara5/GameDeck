import { useState } from 'react'
import DiscoverBrowse from './DiscoverBrowse.jsx'
import DiscoverAsk from './DiscoverAsk.jsx'
import './discover.css'

// Discover is now two modes behind a segmented control:
//   Browse - a filterable IGDB catalog (rails, presets, search, detail sheets)
//   Ask    - the existing AI game-picker chat (unchanged behaviour)
// "Ask AI about this" from a Browse detail sheet flips to Ask with a seed prompt.
export default function DiscoverTab() {
  const [subTab, setSubTab] = useState('browse')
  const [seedPrompt, setSeedPrompt] = useState(null)

  function askAbout(game) {
    const bits = [`What can you tell me about "${game.name}"`]
    if (game.year) bits.push(` (${game.year})`)
    bits.push('? Would it fit my taste, and is it on Game Pass?')
    setSeedPrompt(bits.join(''))
    setSubTab('ask')
  }

  return (
    <div className="discover-page">
      <div className="discover-topbar">
        <h1 className="chat-topbar-title">Discover</h1>
        <div className="seg discover-seg" role="tablist" aria-label="J\ØÛÝ™\ˆ[ÙH‚ˆ]Û‚ˆ\OH˜]Ûˆ‚ˆ›ÛOHXˆ‚ˆ\šXK\Ù[XÝY^ÜÝX•XˆOOH	Øœ›ÝÜÙIßBˆÛ\ÜÓ˜[YO^ØÙYËX‰ÜÝX•XˆOOH	Øœ›ÝÜÙIÈÈ	ÈXÝ]™IÈˆ	ÉßXBˆÛÛXÚÏ^Ê
HOˆÙ]ÝX•XŠ	Øœ›ÝÜÙIÊ_Bˆ‚ˆœ›ÝÜÙBˆØ]Û‚ˆ]Û‚ˆ\OH˜]Ûˆ‚ˆ›ÛOHXˆ‚ˆ\šXK\Ù[XÝY^ÜÝX•XˆOOH	Ø\ÚÉßBˆÛ\ÜÓ˜[YO^ØÙYËX‰ÜÝX•XˆOOH	Ø\ÚÉÈÈ	ÈXÝ]™IÈˆ	ÉßXBˆÛÛXÚÏ^Ê
HOˆÙ]ÝX•XŠ	Ø\ÚÉÊ_Bˆ‚ˆ\ÚÈRBˆØ]Û‚ˆÙ]‚ˆÙ]‚‚ˆËÊˆ›ÝÝ^H[Ý[YÛÈÚ]\ÝÜžHÈØÜ›ÛÝ\š]™HXˆ›\ÎÈÛ›HÛ™HÚÝÜËˆ
‹ßBˆ]ˆÝ[O^ÞÈ\Ü^NˆÝX•XˆOOH	Øœ›ÝÜÙIÈÈ	Ø›ØÚÉÈˆ	Û›Û™IÈ_O‚ˆ\ØÛÝ™\œ›ÝÜÙHÛ\ÚÏ^Ø\ÚÐX›Ý]HÏ‚ˆÙ]‚ˆ]ˆÝ[O^ÞÈ\Ü^NˆÝX•XˆOOH	Ø\ÚÉÈÈ	Ø›ØÚÉÈˆ	Û›Û™IÈ_O‚ˆ\ØÛÝ™\\ÚÈÙYY›Û\^ÜÙYY›Û\HÛ”ÙYYÛÛœÝ[YY^Ê
HOˆÙ]ÙYY›Û\
[
_HÏ‚ˆÙ]‚ˆÙ]‚ˆ
BŸB