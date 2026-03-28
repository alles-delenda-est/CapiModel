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
          de retraite — soit ~14% du PIB, le 3e ratio le plus élevé de l'OCDE. Le système par
          répartition fait face à une pression démographique croissante : le ratio cotisants/retraités
          ne cesse de baisser, et le financement par la dette ne fait que s'aggraver.
        </p>
        <p>
          Ce simulateur explore un scénario radical : <strong>la transition complète
          vers un système par capitalisation</strong>, où chaque travailleur accumule
          un capital personnel financé par ses propres cotisations. Le modèle suit les
          34 équations d'un document technique (<em>cdc_legacy_fund_model.md</em>)
          qui décrit les mécanismes financiers de cette transition sur 70 ans.
        </p>
        <p className="intro-caveat">
          Ce n'est pas une prediction. C'est un outil d'exploration : il rend
          visibles les mecanismes, les tensions et les compromis d'une telle reforme.
        </p>
      </section>

      {/* --- Baseline Results (moved up for visibility) --- */}
      <section className="intro-section">
        <h2>Que montre le scenario de base ?</h2>
        <p>
          Avec les hypotheses par defaut (rendement capitalisation 3% reel,
          croissance salariale 0,7% reel, taux d'emprunt endogene, courbe Equinoxe) :
        </p>
        <div className="baseline-grid">
          <div className="baseline-card">
            <div className="baseline-label">Dette pic</div>
            <div className="baseline-value">{k.peakDebt.toFixed(0)} Md€</div>
            <div className="baseline-sub">Atteinte en {k.peakDebtYear}</div>
          </div>
          <div className="baseline-card">
            <div className="baseline-label">Annee sans dette</div>
            <div className="baseline-value">{k.debtFreeYear || 'Jamais'}</div>
            <div className="baseline-sub">Avec prelevement 30% des Y+15</div>
          </div>
          <div className="baseline-card">
            <div className="baseline-label">Interets cumules</div>
            <div className="baseline-value">{k.totalInterest.toFixed(0)} Md€</div>
            <div className="baseline-sub">Le cout total de la transition</div>
          </div>
          <div className="baseline-card">
            <div className="baseline-label">Pot capitalisation (reel)</div>
            <div className="baseline-value">{k.finalCapiReal.toFixed(0)} Md€</div>
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
            <div className="baseline-value">{k.S0.toFixed(0)} Md€/an</div>
            <div className="baseline-sub">Reductions progressives des pensions elevees</div>
          </div>
        </div>
      </section>

      {/* --- CTA (moved up) --- */}
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
          <button className="cta-btn cta-secondary" onClick={() => navigateTo('simple')}>
            Version simple
          </button>
          <button className="cta-btn cta-secondary" onClick={() => navigateTo('hypotheses')}>
            Voir les hypotheses
          </button>
        </div>
      </section>

      {/* --- The 4 horsemen --- */}
      <section className="intro-section">
        <h2>Les Quatres Chevaliers</h2>
        <p>
        </p>
        <div className="mechanism-grid">
          <div className="mechanism-card">
            <h3>1. La pente démographique</h3>
            <p>
              , et , , et ceux : , et
          . 
            </p>
          </div>
          <div className="mechanism-card">
            <h3>2. La Dette</h3>
            <p>
              symptome de l'échec du système actuel et héraut de 
          notre faillite.
            </p>
          </div>
          <div className="mechanism-card">
            <h3>3. Les marchés sclerosés: le travail</h3>
            <p>
              Premier parmi ceux qui nous empêche de s'en sortir.
            </p>
          </div>
          <div className="mechanism-card">
            <h3>4. Les marchés sclerosés: l'immobilier</h3>
            <p>.

            </p>
          </div>
        </div>
      </section>


      {/* --- Les Vertues --- */}
      <section className="intro-les-vertues">
        <h2>Quatres Vertues Cardinales (budgétaires) aux secours</h2>
        <p>
          L'hypothese de cette simulateur est que la France possede les moyens de s'en sortir, et 
          notamment, que nous pourrions s'appuyer sur quatres vertues budgétaires: 
        </p>
      </section>

      {/* --- The 4 virtues aux secours --- */}
      <section className="intro-section">
        <h2>Les Quatres Vertues aux secours</h2>
        <p>
        </p>
        <div className="mechanism-grid">
          <div className="mechanism-card">
            <h3>1. La Justice</h3>
            <p>
              Le premier étape est d'acter la justice intergenerationnelle, et de consigner un model 
              devenu il y a longtemps caduc de répartition pur à l'histoire. On cesse de faire payer 
              aux actifs les promesses faites aux retraités sans provision. Chaque génération assume 
              sa propre retraite. Concrétement, les cotisations "à la charge de l'employé" (mettant de
              côté la réalité que tous les cotisations sont à la charge de l'employé) sont versés dans 
              un fond de capitalisation.  
            </p>
          </div>
          <div className="mechanism-card">
            <h3>2. La Sobriété</h3>
            <p>
              Une génération moins nombreux que ses ainés ne peut pas supporter la charge actuelle 
              de ses ainés, qui, à cause de l'irresponsibilité de nos politiciens des dernièrs 5 
              décennies, depasse aussi de loin ce que cette génération a cotisé.
              Nous actons donc les baisses des pensions proposé par la parti équinoxe, et nous 
              supprimons également l'absurdité de l'abattement pour frais forfaitaires dans le chef
              des personnes qui n'ont pas, en principe, des frais pour toucher leurs retraites.
            </p>
          </div>
          <div className="mechanism-card">
            <h3>3. La Courage</h3>
            <p>
              Le marché du travail français est tellement cassé que plusiers Presidents ont 
              tenté de s'y attaquer, et ont fléchi au moment critique. Mais pour générer des 
              cotisations supplémentaires c'est nécesssaire. Nous abolissons le CDI, nous 
              abolissons les privilèges syndicales (rien n'empêchera un syndicat de se faire
              voter par la majorité des ouvriers dans une entreprise, pourvu que ce soit par 
              un ballot secret, mais il n'aurons aucun pouvoir de s'y installer autrement), et, 
              mesure facile dans ce pays avec le "filet de sécurité" presque le plus complet du
              monde, nous instaurons le droit de licencier.
              Cela génére une hausse important de la croissance et du taux de la participation, 
              générant des importants hausses des cotisations. 
            </p>
          </div>
          <div className="mechanism-card">
            <h3>4. La Prudence</h3>
            <p>.Le system des logements sociaux est, lui aussi, profondement cassé. Trop des 
              citoyens en réel besoin ne peut pas y acceder, ou souffre de la petite tyrannie 
              d'une bureaucratie trop souvent impitoyable, tandis que trop des copains des partis
              politiques de la gauche en abuse. 
              Nous reformons le parc social en remplacant les logements avec les subventions, 
              accordés uniquement à ceux qui en ont réellement besoin, en les donnant aussi la liberté
              de s'y installer où ils veulent, dans le logement de leur choix. De par ce fait, nous 
              abolissons les exigences de logement social, et nous liquidons progressivement le parc 
              social devenu obsolet, afin de libérer des fonds dans l'immédiat pour payer des droits 
              acquis, et minimisant le recours à la dette.              
            </p>
          </div>
        </div>
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
              Plus aucun euro salarial ne finance les retraites par repartition, dans 
              la théorie (en vrai, les autres impôts, charges, et contributions vont
              toujours financer en partie les retraites par le biais de la fameuse 
              "diversification des moyens de financement". 
            </p>
          </div>
          <div className="mechanism-card">
            <h3>2. Un fonds legacy absorbe le choc</h3>
            <p>
              Les <strong>220 Md€ d'actifs CDC</strong> (hors Livret A) financent un fonds
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
              Le modele ajoute ~1 500 Md€ de dette supplementaire. A ce niveau, le taux
              d'emprunt francais monterait probablement bien au-dessus de l'hypothese
              de base — potentiellement dans la zone ou le spread devient negatif
              et la dette s'auto-alimente.
            </p>
          </div>
          <div className="limitation-item limitation-severe">
            <h4>3. Le rendement de la capitalisation est incertain</h4>
            <p>
              L'hypothese de base de 3% reel est dans la fourchette historique, mais un
              fonds de cette taille (~2 800 Md€ apres 20 ans) serait sans precedent.
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

    </div>
  )
}
