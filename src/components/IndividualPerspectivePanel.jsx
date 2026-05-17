import { useMemo, useState } from 'react'
import {
  runSimulation,
  buildCounterfactualParams,
  computeIndividualPerspective,
} from '../simulation-engine.js'
import './IndividualPerspectivePanel.css'

const fmtEur = (v) => {
  if (v == null || !Number.isFinite(v)) return '—'
  const sign = v < 0 ? '−' : ''
  const abs = Math.abs(Math.round(v))
  return `${sign}${abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`
}

/**
 * "Et pour vous ?" — pedagogical individual-impact panel.
 *
 * Compares a median worker's monthly retirement income under the
 * current reform parameter set vs a no-reform counterfactual (all
 * reform toggles off, baseline employment), as a function of birth year.
 *
 * v1.1: per-cohort PAYG accrual is now read directly from the engine
 * (legacyShareOfCohort + E0_legacy_t × I_factor_t / R0), so the panel's
 * per-individual sum is structurally aligned with the engine's
 * `transitionalPaygExp_t` (eq 25b).
 *
 * Props:
 *   params       — full reform parameter set (matches DEFAULT_CONFIG shape)
 *   reformResults — optional precomputed runSimulation(params); if omitted, runs fresh
 *   minYear, maxYear, defaultYear — slider bounds (default 1965–2010, 1985)
 */
export default function IndividualPerspectivePanel({
  params,
  reformResults: providedReform,
  minYear = 1965,
  maxYear = 2010,
  defaultYear = 1985,
}) {
  const [birthYear, setBirthYear] = useState(defaultYear)

  // CF results are always computed locally (depend only on params).
  // Reform results may be passed in to avoid double-running on the
  // simulator page where the host already has them.
  const { reformResults, cfResults } = useMemo(() => {
    const reformResults = providedReform ?? runSimulation(params)
    const cfResults = runSimulation(buildCounterfactualParams(params))
    return { reformResults, cfResults }
  }, [params, providedReform])

  const data = useMemo(
    () => computeIndividualPerspective(params, reformResults, cfResults, birthYear),
    [params, reformResults, cfResults, birthYear]
  )

  const verdictGood = data.monthlyGain >= 0

  return (
    <div className="ip-panel">
      <p className="ip-intro">
        Quel impact concret pour un salarié médian (~33&nbsp;k€&nbsp;brut/an
        en 2027) ? Déplacez le curseur pour voir l’effet selon votre année
        de naissance.
      </p>

      <div className="ip-slider-card">
        <div className="ip-slider-header">
          <label htmlFor="ip-birth-year">Année de naissance</label>
          <span className="ip-slider-value">{birthYear}</span>
        </div>
        <input
          id="ip-birth-year"
          type="range"
          className="ip-slider"
          min={minYear}
          max={maxYear}
          step={1}
          value={birthYear}
          onChange={(e) => setBirthYear(parseInt(e.target.value, 10))}
        />
        <p className="ip-context">
          {data.ageInY0} ans en {params.Y0 ?? 2027}
          {' · '}Retraite en {data.retirementYear}
          {data.inCapi
            ? ` · ${Math.round(data.yearsInPayg)} ans en répartition + ${data.yearsInCapi} ans en capitalisation`
            : ' · Carrière entière en répartition'}
        </p>
      </div>

      <div className="ip-compare">
        <div className="ip-card">
          <h3>Sans réforme</h3>
          <div className="ip-row">
            <span>Pension (répartition)</span>
            <span className="ip-val">{fmtEur(data.monthlyPensionCF)}</span>
          </div>
          <div className="ip-total">
            <span>Total mensuel</span>
            <span>{fmtEur(data.monthlyPensionCF)}</span>
          </div>
        </div>

        <div className="ip-card">
          <h3>Avec réforme</h3>
          {data.monthlyPensionLegacy > 0 && (
            <div className="ip-row">
              <span>
                Pension répartition
                {data.inCapi
                  ? ` (${Math.round(data.legacyShare * 100)}% droits acquis)`
                  : params.useEquinoxe ? ' (post-Équinoxe)' : ''}
              </span>
              <span className="ip-val">{fmtEur(data.monthlyPensionLegacy)}</span>
            </div>
          )}
          {data.monthlyCapiAnnuity > 0 && (
            <div className="ip-row ip-row-capi">
              <span>Rente capitalisation</span>
              <span className="ip-val">{fmtEur(data.monthlyCapiAnnuity)}</span>
            </div>
          )}
          {data.monthlyPensionTotal === 0 && (
            <div className="ip-row">
              <span>—</span>
              <span className="ip-val">—</span>
            </div>
          )}
          <div className="ip-total">
            <span>Total mensuel</span>
            <span>{fmtEur(data.monthlyPensionTotal)}</span>
          </div>
        </div>
      </div>

      <div className={`ip-verdict ${verdictGood ? 'ip-ok' : 'ip-bad'}`}>
        {verdictGood ? '+' : '−'}{fmtEur(Math.abs(data.monthlyGain))}/mois
        {verdictGood
          ? ' de revenu supplémentaire à la retraite'
          : ' par rapport à la trajectoire sans réforme'}
      </div>

      {data.inCapi && data.capiPotReal > 0 && (
        <p className="ip-pot">
          Pot d’épargne accumulé à la retraite&nbsp;:{' '}
          <strong>{fmtEur(data.capiPotReal)}</strong> (en euros&nbsp;
          {params.Y0 ?? 2027}).{' '}
          Cotisation salarié&nbsp;: {fmtEur(data.monthlyContribS)}/mois ;
          employeur&nbsp;: ~{fmtEur(data.monthlyContribE)}/mois.
        </p>
      )}

      {!data.inCapi && (
        <p className="ip-pot">
          Né(e) avant le seuil ({params.cutoffAge ?? '—'}&nbsp;ans en{' '}
          {params.Y0 ?? 2027}), vous restez intégralement en répartition.
          La réforme Équinoxe, si activée, réduit légèrement la pension
          des tranches au-dessus de 1&nbsp;800&nbsp;€/mois.
        </p>
      )}

      {data.inCapi && data.yearsInPayg > 0 && (
        <p className="ip-pot">
          Cohorte de transition&nbsp;: vos {Math.round(data.yearsInPayg)}&nbsp;ans
          de cotisations PAYG accumulées avant la réforme génèrent une pension
          de répartition partielle (au prorata de votre carrière), à laquelle
          s’ajoute la rente issue de votre pot capitalisé sur les{' '}
          {data.yearsInCapi}&nbsp;années suivantes.
          {' '}La réconciliation entre cette projection individuelle et
          l’agrégat E^trans du moteur suppose une mortalité uniforme sur les
          cohortes de transition (taille survivante au prorata de R^capi&nbsp;;
          cf. spec §5.6.1, construction de réconciliation et «&nbsp;Mortality-bias
          caveat&nbsp;»). Une mortalité différenciée par génération est
          reportée à une version future.
        </p>
      )}

      <p className="ip-disclaimer">
        Projection pédagogique d’un salarié médian. La pension de répartition
        est lue directement depuis le moteur de simulation (modèle d’accrual
        par cohorte §5.6.1)&nbsp;; sous l’hypothèse de mortalité uniforme
        (§5.6.1, «&nbsp;Uniform-mortality reconciliation construction&nbsp;»),
        la somme pondérée sur les cohortes de transition coïncide exactement
        avec l’agrégat E^trans du moteur.
      </p>
    </div>
  )
}
