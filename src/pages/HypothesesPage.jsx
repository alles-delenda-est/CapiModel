import { PRESETS, DREES_DECILES, equinoxeReductionRate } from '../simulation-engine.js'
import './HypothesesPage.css'

// Generate Equinoxe curve sample points for the table
const EQUINOXE_POINTS = [1800, 2000, 2500, 3000, 3500, 4000, 5000]

export default function HypothesesPage() {
  const defaults = PRESETS.default.params

  return (
    <div className="hyp-page">

      {/* --- Preamble --- */}
      <section className="hyp-section hyp-preamble">
        <h2>Transparence des hypothèses</h2>
        <p>
          Un modèle économique ne vaut que par les hypothèses qu'il assume. Cette page les
          met toutes sur la table&nbsp;: <strong>chaque paramètre</strong> du simulateur y
          figure avec sa valeur par défaut, ce qu'il représente, pourquoi nous l'avons
          choisie, et où il cesse d'être crédible. Les sources académiques et
          institutionnelles accompagnent chaque ligne.
        </p>
        <p>
          Rien n'est figé&nbsp;: tous ces paramètres se règlent au curseur dans le
          simulateur. Les valeurs ci-dessous correspondent au scénario
          <strong> «&nbsp;Hypothèses de base&nbsp;»</strong>, celui qui intègre les
          corrections du document critique et que nous tenons pour la meilleure
          approximation honnête.
        </p>
      </section>

      {/* --- Macro --- */}
      <section className="hyp-section">
        <h2>Paramètres macroéconomiques</h2>
        <table className="hyp-table">
          <thead>
            <tr><th>Paramètre</th><th>Valeur</th><th>Explication</th><th>Source</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Inflation π</td>
              <td>{(defaults.pi * 100).toFixed(1)}%</td>
              <td>
                Taux d'inflation annuel. La BCE vise 2&nbsp;% à moyen terme&nbsp;: nous
                retenons cette cible, standard pour toute projection longue, sans oublier
                que l'inflation française a franchi 5-6&nbsp;% en 2022-2023.
              </td>
              <td>Cible BCE</td>
            </tr>
            <tr>
              <td>Croissance salariale réelle w<sub>r</sub></td>
              <td>{(defaults.w_r * 100).toFixed(1)}%</td>
              <td>
                Hausse annuelle des salaires au-delà de l'inflation. La France plafonne à
                ~0,5-0,7&nbsp;% depuis des années, très en dessous de la moyenne OCDE de
                2,5&nbsp;%. Le modèle original tablait sur 1,5&nbsp;%&nbsp;: nous ramenons
                la valeur par défaut à 0,7&nbsp;%, plus prudente et plus fidèle à ce que
                le pays produit réellement.
              </td>
              <td>INSEE, OCDE Employment Outlook 2025</td>
            </tr>
            <tr>
              <td>Horizon N</td>
              <td>{defaults.N} ans</td>
              <td>
                Nombre d'années simulées à partir de 2026. 70 ans couvre la transition de
                bout en bout&nbsp;: le dernier retraité legacy disparaît vers 2096.
              </td>
              <td>Choix de modélisation</td>
            </tr>
            <tr>
              <td>PIB initial</td>
              <td>{defaults.baseGDP.toLocaleString()} Md€</td>
              <td>
                PIB nominal de la France en 2025. Il croît au rythme nominal des
                salaires&nbsp;— simplification commode, qui suppose une part salariale
                constante.
              </td>
              <td>INSEE Comptes nationaux</td>
            </tr>
            <tr>
              <td>Dette existante</td>
              <td>{defaults.existingDebt.toLocaleString()} Md€</td>
              <td>
                Stock de dette souveraine française hors dette de transition. 114&nbsp;%
                du PIB en 2025, soit le 3<sup>e</sup> ratio le plus élevé de la zone euro.
              </td>
              <td>AFT, Eurostat</td>
            </tr>
          </tbody>
        </table>
        <div className="hyp-warning">
          <strong>Point de vigilance&nbsp;:</strong> la croissance salariale est le
          paramètre le plus puissant de tout le modèle. À 0,7&nbsp;% plutôt qu'à
          1,5&nbsp;%, les cotisations cumulées fondent de ~30&nbsp;% sur 40 ans. Tout
          repose sur la vigueur de la masse salariale&nbsp;; on comprend pourquoi nous
          insistons tant sur la libéralisation du marché du travail.
        </div>
      </section>

      {/* --- Transition rule --- */}
      <section className="hyp-section">
        <h2>Règle de transition vers la capitalisation</h2>
        <p>
          Le modèle original faisait basculer 100&nbsp;% des cotisations salariales vers
          la capitalisation dès 2026. Parfaitement cohérent sur le papier, politiquement
          impensable&nbsp;: on ne demande pas à un actif de 62 ans d'abandonner quarante
          années de droits acquis six mois avant sa retraite. Deux paramètres permettent
          désormais de lisser cette bascule.
        </p>

        <h3>1. Règle d'éligibilité à la capitalisation (<code>cutoffAge</code>)</h3>
        <table className="hyp-table">
          <thead>
            <tr><th>Valeur</th><th>Effet</th><th>Justification</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Aucun</strong> (null)</td>
              <td>Tout le monde bascule dès 2026. Comportement du document technique original.</td>
              <td>Référence pure, retenue par le scénario <em>Original v5</em>.</td>
            </tr>
            <tr>
              <td>60 ans</td>
              <td>Les &lt;60 ans en 2026 basculent, les &ge;60 restent en répartition. Phase <em>pure-compounding</em> de 6 ans avant les premiers versements capi.</td>
              <td>Réforme minimale&nbsp;: elle ne protège que les actifs à quelques années de la retraite.</td>
            </tr>
            <tr>
              <td>55 ans</td>
              <td>Phase <em>pure-compounding</em> de 11 ans.</td>
              <td>Compromis intermédiaire.</td>
            </tr>
            <tr>
              <td><strong>50 ans</strong> (défaut)</td>
              <td>
                ~65&nbsp;% des actifs basculent dès l'année 1, 100&nbsp;% après
                ~15&nbsp;ans. Phase <em>pure-compounding</em> de 16 ans. La dette pic
                recule de ~32-38&nbsp;% et les intérêts cumulés de ~47&nbsp;% par rapport
                au basculement immédiat.
              </td>
              <td>
                Le point d'équilibre&nbsp;: assez de courage pour engager la moitié de la
                population, assez de prudence pour préserver les droits acquis de ceux
                qui approchent de la retraite.
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          <strong>Mécanique détaillée&nbsp;:</strong> la part de la masse salariale
          orientée vers la capitalisation croît linéairement, au rythme des jeunes
          cohortes qui entrent sur le marché du travail et des aînés qui partent en
          retraite. Le prélèvement λ (la ponction sur la capi destinée à rembourser la
          dette de transition) n'entre en vigueur qu'après les premiers versements
          capi&nbsp;— on ne ponctionne pas ce qui n'existe pas encore.
        </p>

        <h3>2. Croissance de la dette existante (<code>existingDebtGrowth</code>)</h3>
        <table className="hyp-table">
          <thead>
            <tr><th>Scénario</th><th>Valeur</th><th>Implication</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Original v5</td>
              <td>0 %</td>
              <td>
                La dette française pré-réforme (3&nbsp;200&nbsp;Md€) reste figée pendant
                70 ans pendant que le PIB nominal progresse de ~2,7&nbsp;%/an. Le ratio
                dette/PIB baisse mécaniquement et la prime endogène ne se déclenche
                jamais. Utile pour la rétro-compatibilité, rien de plus.
              </td>
            </tr>
            <tr>
              <td><strong>Hypothèses de base</strong></td>
              <td><strong>2,7 %</strong></td>
              <td>
                La dette existante suit le PIB nominal (inflation 2&nbsp;% + croissance
                salariale 0,7&nbsp;%). Le ratio dette/PIB pré-réforme tient à
                ~114&nbsp;%&nbsp;; seule la dette de transition fait bouger le ratio
                total. C'est la trajectoire honnête.
              </td>
            </tr>
            <tr>
              <td>Optimiste</td>
              <td>2,0 %</td>
              <td>Le PIB croît plus vite que la dette existante, et le pays se désendette doucement.</td>
            </tr>
            <tr>
              <td>Stress</td>
              <td>3,5 %</td>
              <td>
                Déficits structurels persistants, la dette existante dérape plus vite que
                le PIB. Le ratio franchit 150&nbsp;% puis 200&nbsp;%, et la prime de
                risque endogène s'applique alors à <em>toute</em> la dette.
              </td>
            </tr>
          </tbody>
        </table>
        <div className="hyp-warning">
          <strong>Point de vigilance&nbsp;:</strong> ce paramètre n'est pas un aléa, c'est
          une <em>politique budgétaire implicite</em>. Il traduit la capacité (ou
          l'incapacité) de l'État à tenir sa trajectoire de dette hors-réforme. À
          0&nbsp;%, on efface le risque souverain d'un trait de plume&nbsp;; à
          3,5&nbsp;%, on peint la panique des marchés avant qu'elle n'arrive. La
          fourchette honnête pour la France tient dans 2-3&nbsp;%.
        </div>
      </section>

      {/* --- Pension System --- */}
      <section className="hyp-section">
        <h2>Système de retraite — dépenses legacy</h2>
        <table className="hyp-table">
          <thead>
            <tr><th>Paramètre</th><th>Valeur</th><th>Explication</th><th>Source</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Dépenses initiales E<sub>0</sub></td>
              <td>{defaults.E0} Md€</td>
              <td>
                Total des pensions versées en 2025, toutes caisses confondues (base,
                complémentaire, réversion). Environ 14&nbsp;% du PIB&nbsp;— le troisième
                ratio le plus lourd de l'OCDE.
              </td>
              <td>DREES 2022, COR</td>
            </tr>
            <tr>
              <td>Retraités R</td>
              <td>{defaults.R} millions</td>
              <td>
                Nombre total de retraités de droit direct. Le ratio cotisants/retraités
                s'établit autour de 1,7 et continue de s'éroder, année après année.
              </td>
              <td>CNAV, DREES</td>
            </tr>
            <tr>
              <td>Pic cohorte T<sub>pk</sub></td>
              <td>{defaults.Tpk} ans</td>
              <td>
                Nombre d'années avant que les dépenses legacy atteignent leur maximum.
                Il traduit l'arrivée à la retraite des actifs porteurs de droits
                partiels&nbsp;; le pic culmine à +18&nbsp;% au-dessus du niveau initial.
              </td>
              <td>Calibration paramétrique</td>
            </tr>
            <tr>
              <td>Demi-vie cohorte T<sub>hl</sub></td>
              <td>{defaults.Thl} ans</td>
              <td>
                Rythme auquel les dépenses legacy s'éteignent après le pic. 18 ans&nbsp;:
                c'est le temps qu'il faut pour qu'elles retombent de moitié. Extinction
                complète à t&nbsp;=&nbsp;70.
              </td>
              <td>Calibration paramétrique</td>
            </tr>
          </tbody>
        </table>
        <div className="hyp-note">
          <strong>Limite&nbsp;:</strong> le profil de cohorte est paramétrique, pas
          actuariel. Nous le traçons avec une courbe analytique&nbsp;; nous n'injectons
          ni les tables de mortalité INSEE, ni les données génération par génération de
          la CNAV. C'est une approximation, assumée comme telle.
        </div>
      </section>

      {/* --- DREES Distribution --- */}
      <section className="hyp-section">
        <h2>Distribution des pensions — DREES 2022</h2>
        <p>
          Le modèle s'appuie sur la distribution réelle des pensions par déciles pour
          chiffrer les économies de la courbe Équinoxe. Sans surprise, c'est le décile
          10 (pensions supérieures à 2&nbsp;900&nbsp;€/mois) qui concentre l'essentiel du
          gain.
        </p>
        <table className="hyp-table hyp-table-compact">
          <thead>
            <tr>
              <th>Décile</th><th>Borne basse</th><th>Borne haute</th>
              <th>Médiane</th>
            </tr>
          </thead>
          <tbody>
            {DREES_DECILES.map((d, i) => (
              <tr key={i}>
                <td>D{i + 1}</td>
                <td>{d.lo.toLocaleString()} €</td>
                <td>{d.hi.toLocaleString()} €</td>
                <td>{d.mid.toLocaleString()} €</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* --- Equinoxe --- */}
      <section className="hyp-section">
        <h2>Courbe Équinoxe — la réduction progressive des pensions</h2>
        <p>
          Plutôt qu'un couperet au-dessus d'un seuil fixe, la courbe Équinoxe applique un
          <strong> taux de réduction progressif</strong> qui s'alourdit à mesure que la
          pension grimpe. Rien n'est retiré en dessous de 1&nbsp;800&nbsp;€/mois&nbsp;;
          l'effort se concentre sur les pensions les plus élevées, celles qui dépassent
          de loin ce que la génération concernée a réellement cotisé.
        </p>
        <table className="hyp-table hyp-table-compact">
          <thead>
            <tr>
              <th>Pension brute (€/mois)</th>
              <th>Taux de réduction</th>
              <th>Perte mensuelle</th>
            </tr>
          </thead>
          <tbody>
            {EQUINOXE_POINTS.map(p => {
              const rate = equinoxeReductionRate(p)
              return (
                <tr key={p}>
                  <td>{p.toLocaleString()} €</td>
                  <td>{(rate * 100).toFixed(1)}%</td>
                  <td>{(p * rate).toFixed(0)} €</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="hyp-note">
          Cette structure progressive evite l'effet de seuil (notch) de la step function
          et est juridiquement plus robuste vis-a-vis du principe d'egalite. Le total
          des economies est ~26 Md€/an (vs. 13-16 Md€ pour la step function).
        </div>
      </section>

      {/* --- Returns --- */}
      <section className="hyp-section">
        <h2>Rendements financiers</h2>
        <table className="hyp-table">
          <thead>
            <tr><th>Parametre</th><th>Valeur</th><th>Explication</th><th>Source</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Rendement capitalisation r<sub>c</sub></td>
              <td>{(defaults.r_c * 100).toFixed(1)}% reel</td>
              <td>
                Rendement reel des comptes de capitalisation individuels. Un portefeuille
                diversifie 60/40 rapporte historiquement ~3-3,5% reel. Le modele original
                utilisait 4,5% — juge trop optimiste par le critique. 3% est conservateur
                mais plus defensible.
              </td>
              <td>UBS Global Investment Returns Yearbook 2025, DMS</td>
            </tr>
            <tr>
              <td>Rendement fonds legacy r<sub>f</sub></td>
              <td>{(defaults.r_f * 100).toFixed(1)}% reel</td>
              <td>
                Rendement reel des actifs du fonds legacy (portefeuille CDC).
                Similaire a un fonds institutionnel diversifie. Note : les actifs
                CDC incluent des participations illiquides (La Poste, infrastructures)
                qui ne generent pas de rendement cash immediat — le modele surestime
                les revenus du fonds en annees 1-5 de ~20-30%.
              </td>
              <td>CDC Rapport annuel, ECB Working Paper</td>
            </tr>
          </tbody>
        </table>
        <div className="hyp-warning">
          <strong>Point de vigilance :</strong> Un fonds de capitalisation de ~2 800 Md€
          (apres 20 ans) serait sans precedent historique. A cette echelle, les effets
          d'equilibre general deprimeraient les primes de risque actions. Les rendements
          passes ne sont pas extrapolables a cette echelle.
        </div>
      </section>

      {/* --- Sovereign Borrowing --- */}
      <section className="hyp-section">
        <h2>Emprunt souverain — modele de taux endogene</h2>
        <table className="hyp-table">
          <thead>
            <tr><th>Parametre</th><th>Valeur</th><th>Explication</th><th>Source</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Taux de base r<sub>d</sub></td>
              <td>{(defaults.r_d_base * 100).toFixed(1)}% nominal</td>
              <td>
                Taux nominal auquel l'Etat emprunte (OAT 10 ans) lorsque le ratio
                dette/PIB est en dessous du seuil 1. La France emprunte actuellement
                a ~3-3,5%.
              </td>
              <td>Agence France Tresor</td>
            </tr>
            <tr>
              <td>Taux endogene</td>
              <td>{defaults.endogenousRd ? 'Active' : 'Desactive'}</td>
              <td>
                Lorsqu'il est active, le taux d'emprunt augmente automatiquement avec
                le ratio dette/PIB. C'est la correction la plus importante du critique :
                le taux d'emprunt n'est pas un parametre — c'est une variable endogene
                qui reagit a la politique du modele.
              </td>
              <td>Empirique (crise zone euro 2010-2012)</td>
            </tr>
          </tbody>
        </table>

        <h3>Modele de prime de risque a 3 paliers</h3>
        <p>
          Le taux d'emprunt augmente par paliers lorsque le ratio dette/PIB total
          (dette existante + dette de transition) depasse certains seuils :
        </p>
        <table className="hyp-table hyp-table-compact">
          <thead>
            <tr><th>Zone</th><th>Dette/PIB</th><th>Pente</th><th>Explication</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Pas de prime</td>
              <td>&lt; {defaults.rpThreshold1}%</td>
              <td>0</td>
              <td>Les marches ne s'inquietent pas. Cf. Etats-Unis, Italie avant 2010.</td>
            </tr>
            <tr>
              <td>Zone 1</td>
              <td>{defaults.rpThreshold1}% — 200%</td>
              <td>{(defaults.rpSlope1 * 10000).toFixed(0)} bps/pp</td>
              <td>Les marches commencent a reagir. +2 points de base par point de % de dette/PIB.</td>
            </tr>
            <tr>
              <td>Zone 2</td>
              <td>200% — {defaults.rpThreshold3}%</td>
              <td>{(defaults.rpSlope2 * 10000).toFixed(0)} bps/pp</td>
              <td>Pression soutenue. +4 points de base par point de %.</td>
            </tr>
            <tr>
              <td>Zone crise</td>
              <td>&gt; {defaults.rpThreshold3}%</td>
              <td>{(defaults.rpSlope3 * 10000).toFixed(0)} bps/pp</td>
              <td>Regime de crise. Les marches paniquent. +10 points de base par point de %.</td>
            </tr>
          </tbody>
        </table>
        <div className="hyp-note">
          <strong>Seuil critique :</strong> Lorsque le taux d'emprunt reel (r<sub>d</sub> - π)
          depasse le rendement du fonds legacy (r<sub>f</sub>), le spread σ devient negatif.
          A ce stade, la dette s'auto-alimente et ne peut plus etre remboursee.
          Avec les valeurs par defaut : σ = 0 quand r<sub>d</sub> = 5%.
        </div>
      </section>

      {/* --- HLM --- */}
      <section className="hyp-section">
        <h2>Liquidation du parc HLM</h2>
        <table className="hyp-table">
          <thead>
            <tr><th>Parametre</th><th>Valeur</th><th>Explication</th><th>Source</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Parc HLM U<sub>0</sub></td>
              <td>{defaults.U0} millions</td>
              <td>
                Nombre de logements sociaux en France. Le parc decline geometriquement
                au taux ρ.
              </td>
              <td>INSEE, Housing Europe 2025</td>
            </tr>
            <tr>
              <td>Taux de liquidation ρ</td>
              <td>{(defaults.rho * 100).toFixed(0)}%/an</td>
              <td>
                5% = ~265 000 logements vendus par an. Cela represente 28-34% du volume
                total de transactions immobilieres en France. Le modele original utilisait
                10% (juge physiquement impossible par le critique).
              </td>
              <td>critique.md, notaires de France</td>
            </tr>
            <tr>
              <td>Prix marche P<sub>0</sub></td>
              <td>{defaults.P0} k€</td>
              <td>
                Prix moyen de marche d'un logement social. Moyenne nationale ;
                varie fortement entre IDF (~250k€) et province (~120k€).
              </td>
              <td>INSEE, notaires</td>
            </tr>
            <tr>
              <td>Decote volume</td>
              <td>{defaults.hlmDiscount ? 'Activee' : 'Desactivee'}</td>
              <td>
                Lorsqu'activee, le prix de vente est reduit en fonction du volume vendu.
                Plus on vend, plus les prix baissent (loi de l'offre). Elasticite
                δ = {defaults.delta}, plafonnee a 30% de decote maximum.
              </td>
              <td>critique.md (recommandation)</td>
            </tr>
            <tr>
              <td>Croissance prix g<sub>h</sub></td>
              <td>{(defaults.g_h * 100).toFixed(1)}% reel</td>
              <td>
                Hausse annuelle des prix immobiliers au-dela de l'inflation.
                1,5% est dans la fourchette historique pour la France.
              </td>
              <td>INSEE indices de prix</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* --- Contributions --- */}
      <section className="hyp-section">
        <h2>Cotisations</h2>
        <table className="hyp-table">
          <thead>
            <tr><th>Parametre</th><th>Valeur</th><th>Explication</th><th>Source</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Masse salariale W<sub>0</sub></td>
              <td>{defaults.W0.toLocaleString()} Md€</td>
              <td>
                Masse salariale brute totale en France. Croit au taux nominal
                des salaires (inflation + croissance reelle).
              </td>
              <td>INSEE, ACOSS</td>
            </tr>
            <tr>
              <td>Taux salarie τ<sup>s</sup></td>
              <td>{(defaults.tauS * 100).toFixed(1)}%</td>
              <td>
                Cotisation retraite prelevee sur le salaire brut. Dans cette reforme,
                100% va a la capitalisation individuelle des le Jour 1.
              </td>
              <td>URSSAF</td>
            </tr>
            <tr>
              <td>Taux employeur τ<sup>e</sup></td>
              <td>{(defaults.tauE * 100).toFixed(1)}%</td>
              <td>
                Cotisation retraite payee par l'employeur. Sert d'abord a couvrir
                les pensions legacy ; le surplus va a la capitalisation.
                Pendant la phase de deficit (~20 ans), la totalite va au legacy.
              </td>
              <td>URSSAF</td>
            </tr>
            <tr>
              <td>Floor employeur φ<sub>f</sub></td>
              <td>{(defaults.phiF * 100).toFixed(0)}%</td>
              <td>
                Part minimum des cotisations employeur reservee a la capitalisation,
                meme pendant le deficit legacy. A 0%, tout va d'abord au legacy.
              </td>
              <td>Choix de modelisation</td>
            </tr>
          </tbody>
        </table>
        <div className="hyp-warning">
          <strong>Point de vigilance :</strong> Le maintien du taux employeur a 16,5%
          pendant la transition (sans aucun allegement) preserve la structure de cout
          qui fait de la France le pays aux charges patronales les plus elevees de l'OCDE.
          Cela peut supprimer la croissance salariale que le modele suppose.
        </div>
      </section>

      {/* --- CDC & Transition --- */}
      <section className="hyp-section">
        <h2>Fonds CDC et prelevement de transition</h2>
        <table className="hyp-table">
          <thead>
            <tr><th>Parametre</th><th>Valeur</th><th>Explication</th><th>Source</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Actifs CDC F<sub>0</sub></td>
              <td>{defaults.F0} Md€</td>
              <td>
                Valeur des actifs CDC (hors Livret A/Fonds d'Epargne) transferes au
                fonds legacy le Jour 1. Inclut des participations illiquides
                (66% de La Poste, infrastructures) — la valeur realisable est
                probablement 150-170 Md€.
              </td>
              <td>CDC Rapport annuel</td>
            </tr>
            <tr>
              <td>Taux prelevement λ</td>
              <td>{(defaults.lambda * 100).toFixed(0)}%</td>
              <td>
                Fraction des flux de capitalisation prelevee pour accelerer le
                remboursement de la dette de transition.
              </td>
              <td>Choix de modelisation</td>
            </tr>
            <tr>
              <td>Activation T<sub>λ</sub></td>
              <td>Annee +{defaults.Tlambda}</td>
              <td>
                Le prelevement ne s'active qu'apres {defaults.Tlambda} ans
                (2041), le temps que les comptes de capitalisation aient
                accumule suffisamment.
              </td>
              <td>Choix de modelisation</td>
            </tr>
            <tr>
              <td>Abattement fiscal A<sub>0</sub></td>
              <td>{defaults.A0} Md€/an</td>
              <td>
                Economies liees a la suppression de l'abattement fiscal de 10%
                sur les revenus de retraite. Croit avec la masse salariale.
              </td>
              <td>PLF, DREES</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* --- Spread --- */}
      <section className="hyp-section">
        <h2>Le spread σ — indicateur cle de viabilite</h2>
        <div className="hyp-formula">
          σ = r<sub>f</sub> - (r<sub>d</sub> - π)
        </div>
        <p>
          Le spread mesure la difference entre ce que le fonds legacy rapporte (r<sub>f</sub>)
          et ce que la dette coute en termes reels (r<sub>d</sub> - π).
        </p>
        <ul className="hyp-spread-list">
          <li>
            <strong>σ &gt; 0 :</strong> Le fonds gagne plus que le cout de la dette.
            La transition est financierement viable a long terme.
          </li>
          <li>
            <strong>σ = 0 :</strong> Le fonds gagne exactement le cout de la dette.
            Zone de fragilite — aucune marge de securite.
          </li>
          <li>
            <strong>σ &lt; 0 :</strong> La dette coute plus que le fonds ne rapporte.
            <strong> Spirale de dette auto-alimentee</strong> — la transition echoue.
          </li>
        </ul>
        <p>
          Avec les valeurs par defaut : σ = {defaults.r_f * 100}% -
          ({defaults.r_d_base * 100}% - {defaults.pi * 100}%) = {((defaults.r_f - (defaults.r_d_base - defaults.pi)) * 100).toFixed(1)}%.
          Le spread passe a zero si r<sub>d</sub> atteint {((defaults.r_f + defaults.pi) * 100).toFixed(0)}%.
        </p>
      </section>

      {/* --- Presets --- */}
      <section className="hyp-section">
        <h2>Les quatre scenarios pre-configures</h2>
        <div className="preset-explain-grid">
          {Object.entries(PRESETS).map(([key, preset]) => (
            <div key={key} className={`preset-explain-card ${key === 'default' ? 'preset-default' : ''}`}>
              <h3>{preset.label}</h3>
              <p className="preset-desc">{preset.description}</p>
              <div className="preset-params">
                <span>r<sub>c</sub>: {(preset.params.r_c * 100).toFixed(1)}%</span>
                <span>w<sub>r</sub>: {(preset.params.w_r * 100).toFixed(1)}%</span>
                <span>r<sub>d</sub>: {preset.params.endogenousRd ? 'endogene' : (preset.params.r_d_base * 100).toFixed(1) + '% fixe'}</span>
                <span>ρ: {(preset.params.rho * 100).toFixed(0)}%</span>
                <span>E<sub>0</sub>: {preset.params.E0} Md€</span>
                <span>Equinoxe: {preset.params.useEquinoxe ? 'oui' : 'non'}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* --- Compounding Interactions --- */}
      <section className="hyp-section">
        <h2>Interactions entre faiblesses — effets composes</h2>
        <p>
          Les faiblesses ne sont pas independantes. Quand plusieurs hypotheses
          sont simultanement trop optimistes, les effets se composent :
        </p>
        <table className="hyp-table">
          <thead>
            <tr><th>Interaction</th><th>Effet</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Rendement surestime (4,5% → 3%) + emprunt sous-estime (3,5% → 5%+)</td>
              <td>Le spread s'effondre de +3pp a ~0</td>
            </tr>
            <tr>
              <td>Salaires surestimes (1,5% → 0,7%) + charges employeur maintenues</td>
              <td>Cotisations ~30-50% plus faibles, marche du travail stagne</td>
            </tr>
            <tr>
              <td>Plus de dette → taux plus eleves → plus de dette</td>
              <td>Spirale auto-renforcante (regime σ &lt; 0)</td>
            </tr>
            <tr>
              <td>Depenses sous-estimees de ~11% (E<sub>0</sub>: 307 vs 345 Md€)</td>
              <td>Obligations legacy plus elevees des le Jour 1</td>
            </tr>
          </tbody>
        </table>
        <div className="hyp-warning">
          C'est pourquoi le scenario de base utilise des hypotheses prudentes (3% reel,
          0,7% salaires, taux endogene, E<sub>0</sub>=345 Md€). Testez le scenario
          « Stress Test » pour voir ce qui se passe quand plusieurs hypotheses se degradent
          simultanement.
        </div>
      </section>

      {/* --- Monte Carlo --- */}
      <section className="hyp-section">
        <h2>Simulation Monte Carlo</h2>
        <p>
          Le simulateur propose un mode stochastique qui applique des chocs annuels
          correles a quatre parametres cles : r<sub>c</sub>, r<sub>d</sub>, π, w<sub>r</sub>.
          Les correlations sont calibrees sur les donnees empiriques :
        </p>
        <table className="hyp-table hyp-table-compact">
          <thead>
            <tr><th>Paire</th><th>Correlation</th><th>Logique</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>r<sub>c</sub> ↔ π</td>
              <td>-0,2</td>
              <td>Les rendements reels baissent quand l'inflation monte</td>
            </tr>
            <tr>
              <td>r<sub>d</sub> ↔ π</td>
              <td>+0,6</td>
              <td>Les taux d'emprunt montent avec l'inflation</td>
            </tr>
            <tr>
              <td>r<sub>c</sub> ↔ w<sub>r</sub></td>
              <td>+0,3</td>
              <td>La croissance beneficie a la fois aux salaires et aux marches</td>
            </tr>
          </tbody>
        </table>
        <p>
          Les resultats sont affiches sous forme de bandes de confiance (intervalles a 50% et 90%)
          sur les graphiques de dette et de capitalisation. Cela donne une meilleure idee de
          l'incertitude reelle autour des projections deterministes.
        </p>
      </section>

      {/* --- Sources --- */}
      <section className="hyp-section">
        <h2>Sources principales</h2>
        <ul className="hyp-sources">
          <li><strong>DREES</strong> — Distribution des pensions 2022, depenses de protection sociale</li>
          <li><strong>INSEE</strong> — Comptes nationaux, statistiques salariales, indices de prix immobiliers, projections demographiques</li>
          <li><strong>COR</strong> (Conseil d'Orientation des Retraites) — Projections du systeme de retraite</li>
          <li><strong>Agence France Tresor (AFT)</strong> — Taux d'emprunt souverain, profil de la dette</li>
          <li><strong>OCDE</strong> — Employment Outlook 2025, Taxing Wages 2025</li>
          <li><strong>UBS/DMS</strong> — Global Investment Returns Yearbook 2025 (rendements historiques)</li>
          <li><strong>BCE/ECB</strong> — Working papers sur l'impact des fonds souverains sur les marches</li>
          <li><strong>CNAV, AGIRC-ARRCO</strong> — Donnees de cotisants et de retraites</li>
          <li><strong>Breyer (1989)</strong> — Impossibilite d'une transition Pareto-ameliorante PAYG → capitalisation</li>
          <li><strong>Fitch, KBRA</strong> — Notation souveraine francaise (A+)</li>
          <li><strong>CDC</strong> — Rapport annuel, portefeuille d'actifs</li>
          <li><strong>Housing Europe 2025</strong> — Donnees sur le parc social francais</li>
          <li><strong>Notaires de France</strong> — Volumes de transactions immobilieres</li>
        </ul>
      </section>
    </div>
  )
}
