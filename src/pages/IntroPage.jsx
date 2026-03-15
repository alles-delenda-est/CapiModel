import { useMemo } from 'react'
import { runSimulation, extractKPIs, PRESETS } from '../simulation-engine.js'
import './IntroPage.css'

export default function IntroPage({ navigateTo }) {
  // Run baseline scenario to show dynamic numbers
  const baseline = useMemo(() => {
    const results = runSimulation(PRESETS.default.params)
    const kpis = extractKPIs(results)
    return { results, kpis }
  }, [])

  const k = baseline.kpis

  return (
    <div className="intro-page">

      {/* --- Hero --- */}
      <section className="intro-hero">
        <h2>Pourquoi ce simulateur ?</h2>
        <p>
          La France consacre environ <strong>345 milliards d'euros par an</strong> aux pensions
          de retraite — soit ~14% du PIB, le 3e ratio le plus eleve de l'OCDE. Ce systeme
          par repartition (PAYG), ou les cotisations des actifs paient les pensions des
          retraites, fait face a une pression demographique croissante : le ratio
          cotisants/retraites ne cesse de baisser.
        </p>
        <p>
          Ce simulateur explore un scenario radical : <strong>la transition complete
          vers un systeme par capitalisation</strong>, ou chaque travailleur accumule
          un capital personnel finance par ses propres cotisations. Le modele suit les
          34 equations d'un document technique (
          <em>cdc_legacy_fund_model.md</em>) qui decrit les mecanismes financiers
          de cette transition sur 70 ans.
        </p>
        <p className="intro-caveat">
          Ce n'est pas une prediction. C'est un outil d'exploration : il rend
          visibles les mecanismes, les tensions et les compromis d'une telle reforme.
        </p>
      </section>

      {/* --- The Reform Mechanism --- */}
      <section className="intro-section">
        <h2>Comment fonctionne la reforme simulee ?</h2>
        <p>
          A partir de 2026, le modele suppose que :
        </p>
        <div className="mechanism-grid">
          <div className="mechanism-card">
            <h3>1. Les cotisations salaries basculent</h3>
            <p>
              Les 11,3% de cotisations salariales vont a 100% vers des
              <strong> comptes de capitalisation individuels</strong> des le Jour 1.
              Plus aucun euro salarial ne finance les retraites par repartition.
            </p>
          </div>
          <div className="mechanism-card">
            <h3>2. Un fonds legacy absorbe le choc</h3>
            <p>
              Les <strong>220 Md&#8364; d'actifs CDC</strong> (hors Livret A) financent un fonds
              charge de payer les retraites des generations transitionnelles. Ce fonds
              recoit aussi les cotisations employeur, les ventes de logements sociaux
              et les economies de la courbe Equinoxe.
            </p>
          </div>
          <div className="mechanism-card">
            <h3>3. L'Etat emprunte pour combler le deficit</h3>
            <p>
              Pendant les ~20 premieres annees, les revenus du fonds legacy ne
              suffisent pas. Le deficit annuel est couvert par de la <strong>dette
              souveraine</strong> (emissions d'OAT). C'est le cout de la transition.
            </p>
          </div>
          <div className="mechanism-card">
            <h3>4. Un prelevement accelere le remboursement</h3>
            <p>
              A partir de l'annee 15, un <strong>prelevement de 30%</strong> sur les
              flux de capitalisation est redirige vers le remboursement de la dette
              de transition. C'est le principal levier pour atteindre la dette zero.
            </p>
          </div>
        </div>
      </section>

      {/* --- Four Key Dynamics --- */}
      <section className="intro-section">
        <h2>Les quatre dynamiques critiques du modele</h2>
        <div className="mechanism-grid">
          <div className="mechanism-card dynamics-card">
            <h3>L'identite d'Aaron-Samuelson</h3>
            <p>
              La premiere generation de retraites par repartition a recu un « cadeau »
              (des pensions sans avoir cotise). Ce cadeau est une <strong>dette implicite</strong> —
              la transition ne la fait pas disparaitre, elle la transforme en dette souveraine
              explicite, avec des interets en plus. Le modele repose sur l'hypothese que
              le rendement de la capitalisation depasse le cout de cette dette.
            </p>
          </div>
          <div className="mechanism-card dynamics-card">
            <h3>Le cout d'emprunt endogene</h3>
            <p>
              Plus l'Etat emprunte, plus les marches exigent un taux eleve. Le modele
              utilise un <strong>taux d'emprunt qui augmente avec le ratio dette/PIB</strong>,
              selon un modele a 3 paliers calibre sur l'experience francaise, italienne
              et americaine. Au-dessus de 300% de dette/PIB, le taux entre en regime
              de crise.
            </p>
          </div>
          <div className="mechanism-card dynamics-card">
            <h3>La liquidation HLM</h3>
            <p>
              5% du parc HLM (265 000 logements/an) est vendu pour financer le fonds
              legacy. Mais vendre autant de logements d'un coup <strong>fait baisser les
              prix</strong> — le modele applique une decote dependante du volume,
              plafonnee a 30%.
            </p>
          </div>
          <div className="mechanism-card dynamics-card">
            <h3>L'extinction demographique</h3>
            <p>
              La cohorte legacy (retraites ayant des droits PAYG) suit un profil
              en trois phases : montee (8 ans), pic a +18%, puis <strong>decroissance
              exponentielle</strong> avec une demi-vie de 18 ans. Le dernier retraite
              legacy disparait vers 2096 (70 ans apres la reforme).
            </p>
          </div>
        </div>
      </section>

      {/* --- Baseline Results --- */}
      <section className="intro-section">
        <h2>Que montre le scenario de base ?</h2>
        <p>
          Avec les hypotheses par defaut (rendement capitalisation 3% reel,
          croissance salariale 0,7% reel, taux d'emprunt endogene, courbe Equinoxe) :
        </p>
        <div className="baseline-grid">
          <div className="baseline-card">
            <div className="baseline-label">Dette pic</div>
            <div className="baseline-value">{(k.peakDebt / 1000).toFixed(1)} Tn&#8364;</div>
            <div className="baseline-sub">Atteinte en {k.peakDebtYear}</div>
          </div>
          <div className="baseline-card">
            <div className="baseline-label">Annee sans dette</div>
            <div className="baseline-value">{k.debtFreeYear || 'Jamais'}</div>
            <div className="baseline-sub">Avec prelevement 30% des Y+15</div>
          </div>
          <div className="baseline-card">
            <div className="baseline-label">Interets cumules</div>
            <div className="baseline-value">{(k.totalInterest / 1000).toFixed(1)} Tn&#8364;</div>
            <div className="baseline-sub">Le cout total de la transition</div>
          </div>
          <div className="baseline-card">
            <div className="baseline-label">Pot capitalisation (reel)</div>
            <div className="baseline-value">{(k.finalCapiReal / 1000).toFixed(0)} Tn&#8364;</div>
            <div className="baseline-sub">En euros constants 2026</div>
          </div>
          <div className="baseline-card">
            <div className="baseline-label">Spread minimum</div>
            <div className={`baseline-value ${k.minSpread > 0 ? 'spread-ok' : 'spread-bad'}`}>
              {(k.minSpread * 100).toFixed(2)}%
            </div>
            <div className="baseline-sub">{k.minSpread > 0 ? 'Toujours positif' : 'Passe en negatif — zone de danger'}</div>
          </div>
          <div className="baseline-card">
            <div className="baseline-label">Economies Equinoxe</div>
            <div className="baseline-value">{k.S0.toFixed(0)} Md&#8364;/an</div>
            <div className="baseline-sub">Reductions progressives des pensions elevees</div>
          </div>
        </div>
      </section>

      {/* --- Limitations --- */}
      <section className="intro-section">
        <h2>Limites et mises en garde</h2>
        <p>
          Ce modele est un <strong>outil d'exploration pedagogique</strong>, pas une prevision.
          Un document de critique detaille (<em>critique.md</em>) identifie trois faiblesses structurelles
          majeures :
        </p>
        <div className="limitations-list">
          <div className="limitation-item limitation-fatal">
            <h4>1. Le probleme du « double paiement »</h4>
            <p>
              Pendant la transition, les actifs paient a la fois les retraites actuelles
              (via l'impot/la dette) et leur propre capitalisation. Le cout total des
              pensions ne diminue pas — il est simplement etale dans le temps avec des interets.
              C'est une identite economique (Breyer, 1989) que la transition ne peut pas contourner.
            </p>
          </div>
          <div className="limitation-item limitation-fatal">
            <h4>2. Le taux d'emprunt reagit a la politique</h4>
            <p>
              Le modele ajoute ~1,5 Tn&#8364; de dette supplementaire. A ce niveau, le taux
              d'emprunt francais monterait probablement bien au-dessus de l'hypothese
              de base — potentiellement dans la zone ou le spread devient negatif
              et la dette s'auto-alimente.
            </p>
          </div>
          <div className="limitation-item limitation-severe">
            <h4>3. Le rendement de la capitalisation est incertain</h4>
            <p>
              L'hypothese de base de 3% reel est dans la fourchette historique, mais un
              fonds de cette taille (~2,8 Tn&#8364; apres 20 ans) serait sans precedent.
              Les rendements passes ne garantissent pas les rendements futurs, surtout
              a une echelle qui affecterait les marches mondiaux.
            </p>
          </div>
          <div className="limitation-item limitation-moderate">
            <h4>Autres simplifications</h4>
            <p>
              Pas de reponses comportementales (effet Gruber-Wise), pas de chocs
              conjoncturels, pas de differenciation regionale des prix HLM, cohort
              parametrique plutot qu'actuarielle. Voir l'onglet
              <strong> Hypotheses & Sources</strong> pour le detail complet.
            </p>
          </div>
        </div>
      </section>

      {/* --- CTA --- */}
      <section className="intro-section intro-cta">
        <h2>Explorer le simulateur</h2>
        <p>
          Utilisez les curseurs pour tester differentes hypotheses. Chaque parametre
          a une infobulle explicative. Quatre scenarios pre-configures sont disponibles,
          du scenario de base au stress test.
        </p>
        <div className="cta-buttons">
          <button className="cta-btn cta-primary" onClick={() => navigateTo('simulateur')}>
            Ouvrir le simulateur
          </button>
          <button className="cta-btn cta-secondary" onClick={() => navigateTo('hypotheses')}>
            Voir les hypotheses
          </button>
        </div>
      </section>
    </div>
  )
}
