import React, { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { ClubTrend } from '../../../hooks/useDistrictAnalytics'
import { BottomSheet } from '../../BottomSheet'
import { arrayToCSV, downloadCSV } from '../../../utils/csvExport'
import type { useClubPins } from '../useClubPins'
import type { MapTheme, buildPinFeatures } from '../pinLayer'
import { HEALTH_FILLS, buildModeModel } from '../pinModes'
import {
  AREA_NORM,
  PLAN_PARAM,
  applyPlan,
  areaCode,
  areaOptions,
  balanceMetrics,
  encodePlan,
  newAreaId,
  normStatus,
  planCsvRows,
  planSummary,
  setMove,
  decodePlan,
  type AreaOption,
  type AreaRef,
  type Plan,
  type UnitMetrics,
} from './realignPlan'
import './realign.css'

/* Realignment sandbox on the district map (#1819, epic #1781 §2.8).

   A planning tool for the week a District Director realigns: move clubs
   between areas (and so divisions) and watch the per-area and per-division
   balance update. Nothing is saved server-side — the plan is `?plan=` in
   the link (compact, whitelisted at parse), so Copy link shares it; Reset
   and CSV export round it out.

   Loaded only with `?sandbox=1` (an on-demand chunk: the default map's
   first load is at its budget). The page hands over the live map, the
   clubs and the viewed date (R3); this chunk draws the pins itself —
   coloured by proposed area, moved clubs dashed — and the page stands its
   own pin layer down. Two ways to assign, so the map is never the only
   path: tap pins (with a "move tapped clubs to" target, or select then
   pick), or the keyboard-operable list of labelled selects.

   Privacy: names, numbers and areas only — never email, phone or meeting
   links (the CSV included). */

export interface RealignSandboxProps {
  map: MapLibreMap | null
  clubs: ClubTrend[]
  districtId: string
  /** The viewed snapshot date, from the page controls (R3). */
  date: string | null
  isPhone: boolean
  theme: MapTheme
  /** The page's pin hook and feature builder, handed down rather than
   *  imported: a static import from the page's modules here makes the
   *  bundler split them into a chunk the map's first load pays for. */
  pins: typeof useClubPins
  features: typeof buildPinFeatures
}

const NEW_PREFIX = 'new|'
const valueOf = (r: AreaRef) => `${r.divisionId}|${r.areaId}`
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

const Delta: React.FC<{ now: number; was: number }> = ({ now, was }) => {
  const d = now - was
  return (
    <>
      {now}
      {d !== 0 && (
        <span className="realign__delta">({d > 0 ? `+${d}` : `−${-d}`})</span>
      )}
    </>
  )
}

const HealthBar: React.FC<{ m: UnitMetrics }> = ({ m }) => {
  const { thriving, vulnerable, intervention } = m.health
  const parts: Array<[number, string]> = [
    [thriving, HEALTH_FILLS.thriving],
    [vulnerable, HEALTH_FILLS.vulnerable],
    [intervention, HEALTH_FILLS['intervention-required']],
  ]
  return (
    <span
      className="realign__health"
      aria-label={`${thriving} thriving, ${vulnerable} vulnerable, ${intervention} intervention required`}
    >
      <span className="realign__bar" aria-hidden="true">
        {parts.map(([n, fill], i) =>
          n ? <span key={i} style={{ flex: n, background: fill }} /> : null
        )}
      </span>
      <span aria-hidden="true">
        {thriving}·{vulnerable}·{intervention}
      </span>
    </span>
  )
}

const MetricsTable: React.FC<{
  caption: string
  units: UnitMetrics[]
  before: Map<string, UnitMetrics>
  kind: 'area' | 'division'
}> = ({ caption, units, before, kind }) => (
  <div className="realign__table-wrap">
    <table className="realign__table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{kind === 'area' ? 'Area' : 'Division'}</th>
          {kind === 'division' && <th scope="col">Areas</th>}
          <th scope="col">Clubs</th>
          <th scope="col">Members</th>
          <th scope="col">Health</th>
          <th scope="col">
            <abbr title="Distinguished clubs, provisional included">Dist.</abbr>
          </th>
        </tr>
      </thead>
      <tbody>
        {units.map(u => {
          const was = before.get(u.code)
          const changed =
            !was ||
            was.clubs !== u.clubs ||
            was.members !== u.members ||
            was.distinguished !== u.distinguished
          const norm = kind === 'area' ? normStatus(u.clubs) : 'within'
          return (
            <tr key={u.code} className={changed ? 'is-changed' : undefined}>
              <th scope="row">
                {u.code}
                {!was && <span className="realign__tag">new</span>}
              </th>
              {kind === 'division' && (
                <td>
                  <Delta now={u.areas ?? 0} was={was?.areas ?? 0} />
                </td>
              )}
              <td>
                <Delta now={u.clubs} was={was?.clubs ?? 0} />
                {norm !== 'within' && (
                  <span className={`realign__norm realign__norm--${norm}`}>
                    {norm === 'under'
                      ? `under ${AREA_NORM.min}`
                      : `over ${AREA_NORM.max}`}
                  </span>
                )}
              </td>
              <td>
                <Delta now={u.members} was={was?.members ?? 0} />
              </td>
              <td>
                <HealthBar m={u} />
              </td>
              <td>
                {u.distinguished}
                <span className="realign__share">
                  {' '}
                  {Math.round((100 * u.distinguished) / (u.clubs || 1))}%
                </span>
              </td>
            </tr>
          )
        })}
        {/* Areas the plan emptied: shown so the loss is visible. */}
        {[...before.values()]
          .filter(b => !units.some(u => u.code === b.code))
          .map(b => (
            <tr key={b.code} className="is-changed">
              <th scope="row">
                {b.code}
                <span className="realign__tag">emptied</span>
              </th>
              {kind === 'division' && <td>0</td>}
              <td>
                <Delta now={0} was={b.clubs} />
              </td>
              <td colSpan={3}>—</td>
            </tr>
          ))}
      </tbody>
    </table>
  </div>
)

const AreaSelect: React.FC<{
  label: string
  value: string
  options: AreaOption[]
  divisions: string[]
  onChange: (value: string) => void
  placeholder?: string
}> = ({ label, value, options, divisions, onChange, placeholder }) => (
  <select
    className="realign__select"
    aria-label={label}
    value={value}
    onChange={e => onChange(e.target.value)}
  >
    {placeholder !== undefined && <option value="">{placeholder}</option>}
    {divisions.map(div => (
      <optgroup key={div} label={`Division ${div}`}>
        {options
          .filter(o => o.divisionId === div)
          .map(o => (
            <option key={o.label} value={valueOf(o)}>
              {o.label}
            </option>
          ))}
        <option value={`${NEW_PREFIX}${div}`}>New area in {div}</option>
      </optgroup>
    ))}
  </select>
)

const RealignSandbox: React.FC<RealignSandboxProps> = ({
  map,
  clubs,
  districtId,
  date,
  isPhone,
  theme,
  pins: usePins,
  features,
}) => {
  const [params, setParams] = useSearchParams()
  const rawPlan = params.get(PLAN_PARAM)
  const plan = useMemo(() => decodePlan(rawPlan, clubs), [rawPlan, clubs])
  const proposed = useMemo(() => applyPlan(clubs, plan), [clubs, plan])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [brush, setBrush] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [notice, setNotice] = useState('')

  const options = useMemo(() => areaOptions(clubs, plan), [clubs, plan])
  const divisions = useMemo(
    () => [...new Set(options.map(o => o.divisionId))],
    [options]
  )
  const byId = useMemo(
    () => new Map(proposed.map(c => [c.clubId, c])),
    [proposed]
  )
  const originalById = useMemo(
    () => new Map(clubs.map(c => [c.clubId, c])),
    [clubs]
  )

  const writePlan = (next: Plan) => {
    // One URL write per handler (Lesson: two URL-state hooks lose a facet).
    setParams(
      prev => {
        const out = new URLSearchParams(prev)
        const enc = encodePlan(next)
        if (enc) out.set(PLAN_PARAM, enc)
        else out.delete(PLAN_PARAM)
        return out
      },
      { replace: true }
    )
  }

  /** Resolve a select value (an area, or "new area in division X"). */
  const targetOf = (value: string, current: Plan): AreaRef | null => {
    if (value.startsWith(NEW_PREFIX)) {
      const divisionId = value.slice(NEW_PREFIX.length)
      return { divisionId, areaId: newAreaId(divisionId, clubs, current) }
    }
    const [divisionId, areaId] = value.split('|')
    return divisionId && areaId ? { divisionId, areaId } : null
  }

  const move = (ids: string[], value: string) => {
    const to = targetOf(value, plan)
    if (!to) return
    let next = plan
    for (const id of ids) {
      const club = originalById.get(id)
      if (club) next = setMove(next, club, to)
    }
    writePlan(next)
    const names = ids.map(id => originalById.get(id)?.clubName).filter(Boolean)
    setNotice(
      `Moved ${names.length === 1 ? names[0] : plural(names.length, 'club')} to ${areaCode(to)}.`
    )
    // A "new area" target becomes a real option: keep tapping into it.
    if (brush.startsWith(NEW_PREFIX) && value === brush) setBrush(valueOf(to))
  }

  // Pins: coloured by proposed area. Colours come from today's areas (plus
  // any the plan created), so a move never reshuffles the palette.
  const newAreaKey = options
    .filter(o => o.isNew)
    .map(areaCode)
    .join()
  // The territory modes load on demand, as on the page (a static import
  // here would split the page's shared modules into a counted chunk).
  const [territory, setTerritory] = useState<
    typeof import('../pinTerritory') | null
  >(null)
  useEffect(() => {
    void import('../pinTerritory').then(setTerritory)
  }, [])
  const model = useMemo(
    () => {
      if (!territory) return buildModeModel('health')
      const created = new Set(newAreaKey.split(','))
      return territory.territoryModel('area', [
        ...clubs,
        ...proposed.filter(c => created.has(areaCode(c))),
      ])
    },
    // Rebuilt only when the set of new areas changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clubs, newAreaKey, territory]
  )
  const data = useMemo(() => {
    const fc = features(territory ? proposed : [], model)
    for (const f of fc.features)
      f.properties.d = plan.has(f.properties.id) ? 1 : 0
    return fc
  }, [proposed, model, plan, territory, features])

  usePins(map, {
    data,
    model,
    theme,
    selectedIds,
    onSelect: ids => {
      if (brush && ids.length) {
        move(ids, brush)
        setSelectedIds(ids)
      } else {
        setSelectedIds(ids)
        if (isPhone && ids.length) setSheetOpen(true)
      }
    },
    fitKey: `${districtId}|${date}`,
  })

  const current = useMemo(() => balanceMetrics(clubs), [clubs])
  const next = useMemo(() => balanceMetrics(proposed), [proposed])
  const before = useMemo(
    () => ({
      areas: new Map(current.areas.map(a => [a.code, a])),
      divisions: new Map(current.divisions.map(d => [d.code, d])),
    }),
    [current]
  )
  const summary = useMemo(() => planSummary(clubs, plan), [clubs, plan])

  const exitHref = useMemo(() => {
    const out = new URLSearchParams(params)
    out.delete('sandbox')
    out.delete(PLAN_PARAM)
    const s = out.toString()
    return { search: s ? `?${s}` : '' }
  }, [params])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setNotice('Link copied. Anyone with it sees this plan.')
    } catch {
      setNotice('Copy the address bar to share this plan.')
    }
  }
  const exportCsv = () => {
    downloadCSV(
      arrayToCSV(planCsvRows(clubs, plan)),
      `district-${districtId}-realignment-plan-${date ?? 'latest'}.csv`
    )
    setNotice('CSV exported.')
  }
  const reset = () => {
    writePlan(new Map())
    setSelectedIds([])
    setNotice('Plan cleared.')
  }

  const summaryText =
    summary.moved === 0
      ? 'No clubs moved yet.'
      : `${plural(summary.moved, 'club')} moved. Areas outside ${AREA_NORM.min}–${AREA_NORM.max} clubs: ${summary.outsideNorm.current} now → ${summary.outsideNorm.proposed} proposed.`

  const selected = selectedIds
    .map(id => byId.get(id))
    .filter((c): c is ClubTrend => !!c)

  const brushPicker = (
    <label className="realign__field">
      <span>Tap a pin to move it to</span>
      <AreaSelect
        label="Tap a pin to move it to"
        value={brush}
        options={options}
        divisions={divisions}
        onChange={setBrush}
        placeholder="Nothing — tap to select"
      />
    </label>
  )

  const groups = useMemo(() => {
    const out = new Map<string, ClubTrend[]>()
    for (const c of [...proposed].sort((a, b) =>
      a.clubName.localeCompare(b.clubName)
    )) {
      const k = areaCode(c)
      out.set(k, [...(out.get(k) ?? []), c])
    }
    return [...out.entries()].sort(([a], [b]) =>
      a.localeCompare(b, undefined, { numeric: true })
    )
  }, [proposed])

  const panel = (
    <section className="realign" aria-label="Realignment sandbox">
      {!isPhone && <h2 className="realign__title">Realignment sandbox</h2>}
      <p className="realign__note">
        Try a new area layout. Nothing is saved: the plan lives in this page’s
        link, so copying the link shares it.
      </p>
      <div className="realign__actions">
        <button type="button" className="map-pill" onClick={copyLink}>
          Copy link
        </button>
        <button type="button" className="map-pill" onClick={exportCsv}>
          Export CSV
        </button>
        <button
          type="button"
          className="map-pill"
          onClick={reset}
          disabled={plan.size === 0}
        >
          Reset
        </button>
        <Link className="map-pill" to={exitHref}>
          Done
        </Link>
      </div>
      <p className="realign__summary" role="status" aria-label="Plan summary">
        {summaryText}
      </p>
      {notice && <p className="realign__notice">{notice}</p>}

      {!isPhone && brushPicker}

      {selected.length > 0 && (
        <div
          className="realign__group"
          aria-label="Selected clubs"
          role="group"
        >
          <h3 className="realign__heading">Selected</h3>
          <ul className="realign__clubs">
            {selected.map(c => (
              <li key={c.clubId}>
                <span className="realign__club">{c.clubName}</span>
                <AreaSelect
                  label={`Area for ${c.clubName}`}
                  value={valueOf(c)}
                  options={options}
                  divisions={divisions}
                  onChange={v => move([c.clubId], v)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <MetricsTable
        caption="Areas, as proposed (change from today)"
        units={next.areas}
        before={before.areas}
        kind="area"
      />
      <p className="realign__help">
        Health: thriving · vulnerable · intervention required. An area is
        balanced at {AREA_NORM.min}–{AREA_NORM.max} clubs; a Distinguished Area
        needs at least half its clubs Distinguished.
      </p>
      <MetricsTable
        caption="Divisions, as proposed"
        units={next.divisions}
        before={before.divisions}
        kind="division"
      />

      {plan.size > 0 && (
        <div className="realign__group">
          <h3 className="realign__heading" id="realign-moved">
            Moved ({plan.size})
          </h3>
          <ul className="realign__clubs" aria-label="Moved clubs">
            {[...plan.keys()].map(id => {
              const was = originalById.get(id)!
              const now = byId.get(id)!
              return (
                <li key={id}>
                  <span className="realign__club">
                    {was.clubName}
                    <span className="realign__from">
                      {areaCode(was)} → {areaCode(now)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="map-pill"
                    aria-label={`Undo move of ${was.clubName}`}
                    onClick={() => move([id], valueOf(was))}
                  >
                    Undo
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="realign__list">
        {/* The map-free, keyboard path: one labelled select per club.
            Rendered on demand (161 selects is a lot of DOM to keep). */}
        <button
          type="button"
          className="realign__toggle"
          aria-expanded={listOpen}
          onClick={() => setListOpen(o => !o)}
        >
          <span aria-hidden="true">{listOpen ? '▾' : '▸'}</span>
          Assign clubs from a list
        </button>
        {listOpen &&
          groups.map(([code, members]) => (
            <div key={code} className="realign__group">
              <h3 className="realign__heading">
                {code} · {plural(members.length, 'club')}
              </h3>
              <ul className="realign__clubs">
                {members.map(c => (
                  <li key={c.clubId}>
                    <span className="realign__club">{c.clubName}</span>
                    <AreaSelect
                      label={`Area for ${c.clubName}`}
                      value={valueOf(c)}
                      options={options}
                      divisions={divisions}
                      onChange={v => move([c.clubId], v)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </section>
  )

  if (!isPhone)
    return <aside className="map-panel realign-panel">{panel}</aside>

  return (
    <div className="realign-bar">
      <p className="realign-bar__summary" aria-hidden="true">
        {summary.moved === 0
          ? 'Realignment sandbox'
          : `${plural(summary.moved, 'club')} moved · ${summary.outsideNorm.proposed} areas outside ${AREA_NORM.min}–${AREA_NORM.max}`}
      </p>
      {brushPicker}
      {notice && !sheetOpen && (
        <p className="realign__notice" role="status">
          {notice}
        </p>
      )}
      <button
        type="button"
        className="map-pill"
        aria-haspopup="dialog"
        onClick={() => setSheetOpen(true)}
      >
        Open plan
      </button>
      <BottomSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Realignment plan"
        variant="full"
      >
        {panel}
      </BottomSheet>
    </div>
  )
}

export default RealignSandbox
