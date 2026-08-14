import { minutesToHhm } from '../lib/format.js'

// "2h 42m" with the units styled down. Split from minutesToHhm's OUTPUT rather
// than reformatted here, so there is still one definition of how a duration reads.
//
// Emits the `.u` class and nothing else; each surface sizes it (`.activity-mins .u`,
// `.wk-big .u`), because the same duration is a 14px row figure in the Activity feed
// and a 31px hero on Insights.
export default function Hhm({ mins }) {
  return (
    <>
      {minutesToHhm(mins)
        .split(' ')
        .map((part, i) => {
          const m = /^(\d+)([hm])$/.exec(part)
          if (!m) return <span key={i}>{part}</span>
          return (
            <span key={i}>
              {i > 0 ? ' ' : null}
              {m[1]}
              <span className="u">{m[2]}</span>
            </span>
          )
        })}
    </>
  )
}
