import { DEFAULT_CONFIG, DEMOGRAPHIC_PROFILES, DREES_DECILES, equinoxeRate, runSimulation } from '../simulation-engine.js'
import { extractKPIs } from '../presets.js'
import './HypothesesPage.css'

// Sample points illustrating the Équinoxe step function
const EQUINOXE_POINTS = [1500, 1900, 2250, 2750, 3500, 5000, 7000]

// Live KPI computation — matches the §11.3 fixture by construction.
// If display ever diverges from the fixture, that's an engine regression
// (see §11.3 regression test); escalate rather than patching the UI.
const liveDefaultRows = runSimulation()
const liveKPIs = extractKPIs(liveDefaultRows)

const fmtPct = v => `${(v * 100).toFixed(2)}%`
const fmtPct1 = v => `${(v * 100).toFixed(1)}%`
const fmtN = v => Math.round(v).toLocaleString('fr-FR').replace(/ /g, ' ')

// Kind tag display — S (sourced) / C (calibrated) / M (modelling assumption)
const Kind = ({ k }) => <span className={`kind-tag kind-${k.toLowerCase()}`}>{k}</span>

export default function HypothesesPage() {
  const d = DEFAULT_CONFIG

  return (
    <div className="hyp-page">

      {/* --- Preamble --- */}
      <section className="hyp-section hyp-preamble">
        <h2>Transparence des hypothèses (v1.0a)</h2>
        <p>
          Un modèle économique ne vaut que par les hypothèses qu'il assume. Cette page
          les met toutes sur la table&nbsp;: <strong>chaque paramètre</strong> du
          simulateur y figure avec sa valeur par défaut, sa nature
          (<Kind k="S" /> sourcée, <Kind k="C" /> calibrée, <Kind k="M" /> hypothèse de
          modélisation), et la justification.
        </p>
        <p>
          Les valeurs ci-dessous correspondent au scénario <strong>« Hypothèses de base
          v1.0a »</strong>. Tous ces paramètres se règlent au curseur dans le simulateur.
        </p>
      </section>

      {/* --- v1.0a corrections note (REQUIRED by Task 3 brief) --- */}
      <section className="hyp-section hyp-warning-section">
        <h2>Corrections v1.0a vs. v1.0</h2>
        <p>
          v1.0a introduit quatre corrections par rapport à v1.0 que les utilisateurs
          peuvent remarquer dans la liste de paramètres&nbsp;:
        </p>
        <ol>
          <li>
            <strong>Le taux sans risque est dédoublé</strong> en
            <code> r_f_portfolio</code> (rendement du fonds legacy, Tier A) et
            <code> r_f_annuity</code> (coût de couverture annuité, Tier B), résolvant
            un arbitrage carry-trade dans la tarification.
          </li>
          <li>
            <strong>Les unités HLM évoluent uniformément</strong> (eq 27)&nbsp;:
            <code> ΔU_t = U₀ × (1−ρ)<sup>t</sup> × ρ</code> pour tout <em>t</em>,
            rétablissant la conservation des masses.
          </li>
          <li>
            <strong>Les pensions capi sont calculées par part actuarielle</strong>
            des actifs (<code>capiAssetShare_t</code>, eq 53), non par tête. La v1.0
            exproprait l'épargne des travailleurs en accumulation au profit des
            retraités précoces, masquant l'écart actuariel réel.
          </li>
          <li>
            <strong>Équinoxe est dédoublée par périmètre</strong>&nbsp;: réduction
            côté prestation (retraités legacy uniquement, eqs 18b–18c) et restauration
            CSG/CRDS côté recette (tous retraités, eqs 21a/21b/22).
          </li>
        </ol>
        <p>
          Voir spec §5.5, §5.7, §5.13 pour les démonstrations.
        </p>
      </section>

      {/* --- §3.1 Macro --- */}
      <section className="hyp-section">
        <h2>1. Paramètres macroéconomiques (§3.1)</h2>
        <table className="hyp-table">
          <thead>
            <tr><th>Paramètre</th><th>Valeur</th><th>Type</th><th>Source / rationale</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Inflation π</td><td>{fmtPct(d.pi)}</td><td><Kind k="S" /></td>
              <td>Cible BCE 2&nbsp;%.</td>
            </tr>
            <tr>
              <td>Croissance salariale w<sub>r</sub></td><td>{fmtPct(d.w_r)}</td><td><Kind k="S" /></td>
              <td>SMPT moyenne INSEE 2014–2024 ; le 2024–2026 a été plus haut (~0,5–0,7%) post-inflation, mais la BdF Avril 2026 voit ~0,2% réel attendu pour 2026.</td>
            </tr>
            <tr>
              <td>r_f_portfolio (NEW v1.0a)</td><td>{fmtPct(d.r_f_portfolio)}</td><td><Kind k="S" /></td>
              <td>Rendement réel du portefeuille 60/40 institutionnel diversifié — médiane historique OCDE. Utilisé par eq 36 (rendement fonds) et eq 58 (spread).</td>
            </tr>
            <tr>
              <td>r_f_annuity (NEW v1.0a)</td><td>{fmtPct(d.r_f_annuity)}</td><td><Kind k="S" /></td>
              <td>Rendement réel de la dette souveraine indexée (OATi). 0,5–1,5% en 2024–2026. Utilisé par eq 53 pour tarifer l'annuité indexée du pot capi. Distinct de r_f_portfolio&nbsp;: une annuité indexée doit être couverte au taux auquel l'État peut hedger l'obligation, pas au rendement diversifié.</td>
            </tr>
            <tr>
              <td>r_c</td><td>{fmtPct(d.r_c)}</td><td><Kind k="S" /></td>
              <td>Norvège GPFG 1998–2025 (~6,64% nominal, ~4,5% réel) ; Ontario Teachers' 7% nominal cible long terme.</td>
            </tr>
            <tr>
              <td>r_d_base</td><td>{fmtPct(d.r_d_base)}</td><td><Kind k="S" /></td>
              <td>OAT 10y ~3,4–3,7% début 2026 (BdF). 3,5% est une projection prudente conditionnelle à un plan crédible de réforme.</td>
            </tr>
            <tr>
              <td>existingDebt</td><td>{fmtN(d.existingDebt)} Md€</td><td><Kind k="S" /></td>
              <td>INSEE 2024 = 3&nbsp;200 Md€&nbsp;; projeté à ~2,5%/an nominal jusqu'à Y0 = 2027.</td>
            </tr>
            <tr>
              <td>baseGDP</td><td>{fmtN(d.baseGDP)} Md€</td><td><Kind k="S" /></td>
              <td>INSEE 2024 = 2&nbsp;850 Md€ ; ~1,7%/an nominal jusqu'à Y0 = 2027.</td>
            </tr>
            <tr>
              <td>R0</td><td>{d.R0} M</td><td><Kind k="S" /></td>
              <td>Retraités droits directs DREES Édition 2025, projeté à fin 2026.</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* --- R0/E0 asymmetry note (REQUIRED by Task 3 brief) --- */}
      <section className="hyp-section hyp-note-section">
        <h3>Note de périmètre R₀ / E₀ (§10.14)</h3>
        <p>
          <strong>R₀</strong> ({d.R0} M, droits directs uniquement) et
          <strong> E₀</strong> ({d.E0} Md€, tous retraités y compris pensions de
          réversion) sont sur des périmètres différents par construction. Le calcul
          des tranches Équinoxe (eq 18) opère sur les droits directs via R₀&nbsp;;
          la mise à l'échelle des dépenses legacy absorbe implicitement les ~11%
          de pensions de réversion via l'indice <code>legacyRetirees(t)</code>
          ancré sur R₀.
        </p>
        <p>
          Spec §10.14 documente le raisonnement et signale un correctif v1.1 qui
          dédoublerait le noyau de cohorte legacy en sous-cohortes droits-directs et
          réversion-seule. <strong>Ne pas « harmoniser » R₀ à 19 M&nbsp;:</strong>
          cela créerait un mismatch de périmètre avec les déciles DREES.
        </p>
      </section>

      {/* --- §3.2 Workforce --- */}
      <section className="hyp-section">
        <h2>2. Cotisations &amp; emploi (§3.2)</h2>
        <table className="hyp-table">
          <thead><tr><th>Paramètre</th><th>Valeur</th><th>Type</th><th>Source / rationale</th></tr></thead>
          <tbody>
            <tr><td>W₀ (masse salariale brute)</td><td>{fmtN(d.W0)} Md€</td><td><Kind k="S" /></td>
              <td>INSEE 2024 = 1&nbsp;250 Md€ ; ~1,85%/an jusqu'à Y0.</td></tr>
            <tr><td>τ_s (cotisation salarié)</td><td>{fmtPct(d.tau_s)}</td><td><Kind k="S" /></td>
              <td>CNAV + Agirc-Arrco.</td></tr>
            <tr><td>τ_e (cotisation employeur)</td><td>{fmtPct(d.tau_e)}</td><td><Kind k="S" /></td>
              <td>Équivalent total.</td></tr>
            <tr><td>employmentRate0</td><td>{fmtPct(d.employmentRate0)}</td><td><Kind k="S" /></td>
              <td>INSEE taux d'emploi 15–64, 2024.</td></tr>
            <tr><td>employmentRateTarget</td><td>{fmtPct(d.employmentRateTarget)}</td><td><Kind k="C" /></td>
              <td>Cible OCDE-médiane ; réglable pour scénarios de réforme du marché du travail.</td></tr>
            <tr><td>employmentTransitionYears</td><td>{d.employmentTransitionYears} ans</td><td><Kind k="M" /></td>
              <td>Durée smoothstep vers la cible.</td></tr>
          </tbody>
        </table>
      </section>

      {/* --- §3.3 Retirement age (NEW SECTION) --- */}
      <section className="hyp-section">
        <h2>3. Âge de retraite (§3.3) — NOUVEAU v1.0</h2>
        <p>
          v1.0 introduit un noyau d'âge de retraite paramétrique. v1.0a en hérite
          tel quel. Voir spec §5.4 pour la mécanique, §6.7 pour les invariants,
          §10.7 pour les pièges.
        </p>
        <table className="hyp-table">
          <thead><tr><th>Paramètre</th><th>Valeur</th><th>Type</th><th>Source / rationale</th></tr></thead>
          <tbody>
            <tr><td>retirementAgeBase</td><td>{d.retirementAgeBase} ans</td><td><Kind k="S" /></td>
              <td>Âge effectif post-réforme 2023 (France).</td></tr>
            <tr><td>retirementAgeMode</td><td><code>{d.retirementAgeMode}</code></td><td><Kind k="M" /></td>
              <td>« fixe » garde la base constante&nbsp;; « indexé » l'augmente d'1/2 du gain d'espérance de vie à 65 (logique Suède/Italie NDC).</td></tr>
            <tr><td>retirementAgeFloor / Ceil</td><td>{d.retirementAgeFloor} / {d.retirementAgeCeil}</td><td><Kind k="M" /></td>
              <td>Bornes dures (clamp eq 12d).</td></tr>
            <tr><td>lifeExpAt65_Y0</td><td>{d.lifeExpAt65_Y0} ans</td><td><Kind k="S" /></td>
              <td>INSEE 2024 (19,7+23,4)/2 = 21,55 ; projeté +3 ans à Y0=2027 au taux COR. Non réglable utilisateur (à recalculer si Y0 change).</td></tr>
            <tr><td>lifeExpAt65_per_decade</td><td>{d.lifeExpAt65_per_decade} ans/décennie</td><td><Kind k="S" /></td>
              <td>COR juin 2025, scénario central ; gain ≈4,2 ans sur 4,6 décennies.</td></tr>
            <tr><td>LIFE_EXP_INDEXATION_FRACTION</td><td>0,5</td><td><Kind k="M" /></td>
              <td>Hardcodé spec §3.3 — moitié des gains LE va à l'âge, moitié à la durée. Candidat v1.1 pour exposition utilisateur (§10.13).</td></tr>
          </tbody>
        </table>
      </section>

      {/* --- §3.4 HLM --- */}
      <section className="hyp-section">
        <h2>4. HLM &amp; logement (§3.4)</h2>
        <table className="hyp-table">
          <thead><tr><th>Paramètre</th><th>Valeur</th><th>Type</th><th>Source / rationale</th></tr></thead>
          <tbody>
            <tr><td>U₀ (parc HLM)</td><td>{d.U0} M unités</td><td><Kind k="S" /></td><td>USH 2024.</td></tr>
            <tr><td>P₀ (prix marché)</td><td>{d.P0} k€</td><td><Kind k="S" /></td><td>DGALN 2024.</td></tr>
            <tr><td>P_book</td><td>{d.Pbook} k€</td><td><Kind k="S" /></td><td>Caisse des Dépôts.</td></tr>
            <tr><td>ρ (taux liquidation)</td><td>{fmtPct1(d.rho)}/an</td><td><Kind k="M" /></td>
              <td>5%/an = ~265 000 logements/an ; politiquement faisable mais haut.</td></tr>
            <tr><td>g_h (croissance prix)</td><td>{fmtPct1(d.g_h)}</td><td><Kind k="S" /></td>
              <td>Indices Notaires INSEE 1995–2019.</td></tr>
            <tr><td>T_hlm (durée programme)</td><td>{d.T_hlm} ans</td><td><Kind k="M" /></td>
              <td>5 ans de taper en fin.</td></tr>
            <tr><td>δ (élasticité décote)</td><td>{d.delta}</td><td><Kind k="C" /></td>
              <td>Décote volume / unit-traded baseline.</td></tr>
            <tr><td>baselineTransactions</td><td>{fmtN(d.baselineTransactions)}/an</td><td><Kind k="S" /></td>
              <td>FNAIM 2024.</td></tr>
            <tr><td>constructionMultiplier</td><td>{d.constructionMultiplier}×</td><td><Kind k="M" /></td>
              <td>Levier libéralisation foncière&nbsp;; &gt;1 = libéralisation.</td></tr>
          </tbody>
        </table>
      </section>

      {/* --- §3.5 Équinoxe --- */}
      <section className="hyp-section">
        <h2>5. Dépenses pension &amp; Équinoxe (§3.5)</h2>
        <table className="hyp-table">
          <thead><tr><th>Paramètre</th><th>Valeur</th><th>Type</th><th>Source / rationale</th></tr></thead>
          <tbody>
            <tr><td>E₀ (dép. pension totale)</td><td>{d.E0} Md€/an</td><td><Kind k="S" /></td>
              <td>DREES 2025 13,1% PIB en 2023 → ~390 Md€ projeté Y0. Périmètre&nbsp;: tous retraités (cf. note R₀/E₀ §10.14).</td></tr>
            <tr><td>useEquinoxe</td><td>{String(d.useEquinoxe)}</td><td><Kind k="M" /></td>
              <td>Master toggle réforme Équinoxe.</td></tr>
            <tr><td>equinoxePhasing</td><td><code>{d.equinoxePhasing}</code></td><td><Kind k="M" /></td>
              <td>Phasage temporel&nbsp;: <code>immediate</code>, <code>phased-5y</code>, <code>phased-10y</code>, <code>partial-50</code>, <code>partial-75</code>. Caché en mode expert.</td></tr>
            <tr><td>S0_irDeduction</td><td>{d.S0_irDeduction} Md€</td><td><Kind k="S" /></td>
              <td>Suppression abattement IR 10% (Contre-Budget 2026). Côté prestation (legacy uniquement).</td></tr>
            <tr><td>S0_csg</td><td>{d.S0_csg} Md€</td><td><Kind k="S" /></td>
              <td>Restauration CSG/CRDS taux plein (Contre-Budget 2026). Côté recette (tous retraités), eq 22.</td></tr>
          </tbody>
        </table>

        <h3 style={{ marginTop: '1.5rem' }}>Fonction de réduction r(p) — eq (18a)</h3>
        <table className="hyp-table">
          <thead><tr><th>Pension brute (€/mois)</th><th>r(p)</th></tr></thead>
          <tbody>
            {EQUINOXE_POINTS.map(p => (
              <tr key={p}>
                <td>{p.toLocaleString('fr-FR')}</td>
                <td>{fmtPct1(equinoxeRate(p))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={{ marginTop: '1.5rem' }}>Distribution DREES 2022 par décile</h3>
        <table className="hyp-table">
          <thead><tr><th>Décile</th><th>lo (€/mois)</th><th>hi (€/mois)</th></tr></thead>
          <tbody>
            {DREES_DECILES.map((dec, i) => (
              <tr key={i}>
                <td>D{i + 1}</td>
                <td>{dec.lo.toLocaleString('fr-FR')}</td>
                <td>{dec.hi.toLocaleString('fr-FR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* --- §3.6 Capi --- */}
      <section className="hyp-section">
        <h2>6. Capitalisation (§3.6)</h2>
        <table className="hyp-table">
          <thead><tr><th>Paramètre</th><th>Valeur</th><th>Type</th><th>Source / rationale</th></tr></thead>
          <tbody>
            <tr><td>enableCapi</td><td>{String(d.enableCapi)}</td><td><Kind k="M" /></td><td>Master toggle capi.</td></tr>
            <tr><td>cutoffAge</td><td>{d.cutoffAge ?? 'null'} ans</td><td><Kind k="M" /></td>
              <td>Âge max en 2027 pour intégrer capi&nbsp;; null = universel.</td></tr>
            <tr><td>α (surplus → dette)</td><td>{d.alpha}</td><td><Kind k="M" /></td>
              <td>Fraction du surplus annuel dirigée vers remboursement.</td></tr>
            <tr><td>λ (prélèvement)</td><td>{fmtPct1(d.lambda)}</td><td><Kind k="M" /></td>
              <td>Prélèvement transition sur flux capi.</td></tr>
            <tr><td>T_λ</td><td>{d.Tlambda} ans</td><td><Kind k="M" /></td>
              <td>Année d'activation (smoothing ±1 an).</td></tr>
            <tr><td>capiAssetShareSteadyState (NEW v1.0a)</td><td>{d.capiAssetShareSteadyState}</td><td><Kind k="C" /></td>
              <td>Part actuarielle long terme du pot K détenue par retraités vs travailleurs en accumulation. Ramp 30y depuis T_capi_start (eq 53a). Ancrée sur Australie super (~30%), Chili AFP (~35–40%), UK DC (~30–35%) à maturité. Sans ce paramètre, le modèle exproprie l'épargne des travailleurs (bug v1.0). v1.1 pourrait remplacer par tracking explicite retraités-vs-travailleurs.</td></tr>
          </tbody>
        </table>
      </section>

      {/* --- §3.7 Rate premium --- */}
      <section className="hyp-section">
        <h2>7. Prime de risque endogène (§3.7)</h2>
        <table className="hyp-table">
          <thead><tr><th>Paramètre</th><th>Valeur</th><th>Type</th></tr></thead>
          <tbody>
            <tr><td>rpThreshold1 / Slope1</td><td>{d.rpThreshold1}% / {(d.rpSlope1 * 10000)} bps/pp</td><td><Kind k="C" /></td></tr>
            <tr><td>rpThreshold2 / Slope2</td><td>{d.rpThreshold2}% / {(d.rpSlope2 * 10000)} bps/pp</td><td><Kind k="C" /></td></tr>
            <tr><td>rpThreshold3 / Slope3</td><td>{d.rpThreshold3}% / {(d.rpSlope3 * 10000)} bps/pp</td><td><Kind k="C" /></td></tr>
            <tr><td>r_d_cap</td><td>{fmtPct(d.r_d_cap)}</td><td><Kind k="M" /></td></tr>
          </tbody>
        </table>
        <p>
          Aucune prime sous le seuil 1 (150% PIB). Pente progressive ensuite&nbsp;; au-delà
          de r_d_cap = 20%, le souverain est en sortie de marché (modèle non applicable).
        </p>
      </section>

      {/* --- §3.8 GE penalty --- */}
      <section className="hyp-section">
        <h2>8. Pénalité GE (§3.8)</h2>
        <table className="hyp-table">
          <thead><tr><th>Paramètre</th><th>Valeur</th><th>Type</th><th>Source / rationale</th></tr></thead>
          <tbody>
            <tr><td>geKneeRatio</td><td>{d.geKneeRatio}× PIB</td><td><Kind k="M" /></td>
              <td>Norvège GPFG sustained &gt;2× PIB sans compression évidente du rendement.</td></tr>
            <tr><td>geFloorRatio</td><td>{d.geFloorRatio}× PIB</td><td><Kind k="M" /></td>
              <td>Au-delà, r_c → 0 par taper linéaire.</td></tr>
          </tbody>
        </table>
      </section>

      {/* --- §3.9 Other --- */}
      <section className="hyp-section">
        <h2>9. Autres (§3.9)</h2>
        <table className="hyp-table">
          <thead><tr><th>Paramètre</th><th>Valeur</th><th>Type</th><th>Source / rationale</th></tr></thead>
          <tbody>
            <tr><td>F₀ (fonds initial)</td><td>{d.F0} Md€</td><td><Kind k="C" /></td>
              <td>CDC propre (220) + FRR (~36) + Agirc-Arrco (~85).</td></tr>
            <tr><td>A₀ (récup. abattements)</td><td>{d.A0} Md€/an</td><td><Kind k="C" /></td>
              <td>Année 0.</td></tr>
            <tr><td>demoProfile</td><td><code>{d.demoProfile}</code></td><td><Kind k="M" /></td>
              <td>Un de&nbsp;: <code>cor_central</code>, <code>realistic</code>, <code>reformed</code>.</td></tr>
            <tr><td>N (horizon)</td><td>{d.N} ans</td><td><Kind k="M" /></td>
              <td>Y0 + 70 = jusqu'à 2096. Suffit pour voir l'extinction de la cohorte legacy.</td></tr>
            <tr><td>Y₀ (année réforme)</td><td>{d.Y0}</td><td><Kind k="M" /></td>
              <td>Année de référence de la simulation.</td></tr>
          </tbody>
        </table>
      </section>

      {/* --- Profils démo --- */}
      <section className="hyp-section">
        <h2>10. Profils démographiques (§4)</h2>
        <table className="hyp-table">
          <thead><tr><th>Profil</th><th>peakMult</th><th>longRunMult</th><th>peakT</th><th>Δ ratio dépendance 2027→2070</th></tr></thead>
          <tbody>
            <tr><td><code>cor_central</code></td>
              <td>{DEMOGRAPHIC_PROFILES.cor_central.peakMult}</td>
              <td>{DEMOGRAPHIC_PROFILES.cor_central.longRunMult}</td>
              <td>{DEMOGRAPHIC_PROFILES.cor_central.peakT}</td>
              <td>+42% (vs COR central +48%)</td></tr>
            <tr><td><code>realistic</code></td>
              <td>{DEMOGRAPHIC_PROFILES.realistic.peakMult}</td>
              <td>{DEMOGRAPHIC_PROFILES.realistic.longRunMult}</td>
              <td>{DEMOGRAPHIC_PROFILES.realistic.peakT}</td>
              <td>+70%</td></tr>
            <tr><td><code>reformed</code></td>
              <td>{DEMOGRAPHIC_PROFILES.reformed.peakMult}</td>
              <td>{DEMOGRAPHIC_PROFILES.reformed.longRunMult}</td>
              <td>{DEMOGRAPHIC_PROFILES.reformed.peakT}</td>
              <td>+21%</td></tr>
          </tbody>
        </table>
      </section>

      {/* --- KPIs live --- */}
      <section className="hyp-section">
        <h2>11. KPI du préset par défaut</h2>
        <p>
          Calculés en direct par le moteur v1.0a (pas de cache). Identiques par
          construction au fixture <code>tests/fixtures/v1.0a-default-trace.json</code>
          (test §11.3 fait foi). Si l'affichage diverge du fixture, c'est une
          régression moteur — escalader plutôt que patcher l'UI.
        </p>
        <table className="hyp-table">
          <thead><tr><th>Indicateur</th><th>Valeur</th></tr></thead>
          <tbody>
            <tr><td>Dette pic</td><td>{fmtN(liveKPIs.peakDebt)} Md€ ({liveKPIs.peakDebtYear})</td></tr>
            <tr><td>Année sans dette</td><td>{liveKPIs.debtFreeYear ?? 'jamais'}</td></tr>
            <tr><td>Intérêts cumulés</td><td>{fmtN(liveKPIs.totalInterest)} Md€</td></tr>
            <tr><td>Pot capi (réel 2027€)</td><td>{fmtN(liveKPIs.finalCapiReal)} Md€</td></tr>
            <tr><td>Position nette finale</td><td>{fmtN(liveKPIs.netPosition)} Md€</td></tr>
            <tr><td>Insuffisance capi cumulée</td><td>{fmtN(liveKPIs.totalCapiShortfall)} Md€</td></tr>
            <tr><td>Économies pension S₀ (t=0, pré-phasing)</td><td>{liveKPIs.S0.toFixed(2)} Md€/an</td></tr>
          </tbody>
        </table>
      </section>

    </div>
  )
}
