import { PRESETS, DREES_DECILES, equinoxeReductionRate } from '../simulation-engine.js'
import './HypothesesPage.css'

// Sample points illustrating the Équinoxe step function — one per bracket + above cap
const EQUINOXE_POINTS = [1500, 1900, 2250, 2750, 3500, 5000, 7000]

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
          <strong> «&nbsp;Hypothèses de base&nbsp;»</strong>.
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
                2,5&nbsp;%. Le modèle de base tablait sur 1,5&nbsp;%&nbsp;: nous ramenons
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
          Le modèle de base faisait basculer 100&nbsp;% des cotisations salariales vers
          la capitalisation dès 2026. Parfaitement cohérent sur le papier, politiquement
          impensable&nbsp;: on ne demande pas à un actif de 62 ans d'abandonner quarante
          années de droits acquis six mois avant sa retraite. Deux paramètres permettent
          de lisser cette bascule.
        </p>

        <h3>1. Règle d'éligibilité à la capitalisation (<code>cutoffAge</code>)</h3>
        <table className="hyp-table">
          <thead>
            <tr><th>Valeur</th><th>Effet</th><th>Justification</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Aucun</strong> (null)</td>
              <td>Tout le monde bascule dès 2026. Aucun paramètre d'âge.</td>
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
                Dépenses cibles du simulateur (pensions contributives de base, complémentaires
                et réversion), représentant ~12,1&nbsp;% du PIB modélisé. Ce chiffre est 
                inférieur aux ~13,8&nbsp;% projetés par le COR car il <strong>exclut 
                délibérément</strong> le minimum vieillesse (ASPA), les départs anticipés 
                pour invalidité, les déficits de certains régimes spéciaux et les frais 
                de gestion administrative.
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
              <td>Pic démographique T<sub>demo</sub></td>
              <td>22 ans</td>
              <td>
                Timing du pic du «&nbsp;papy-boom&nbsp;»&nbsp;: l'indice retraités/actifs
                (<code>retireeIdx</code>) monte en douceur (smoothstep) de 1,00 à 1,30 sur
                22 ans, puis redescend vers 1,25. Valeur calibrée par balayage paramétrique
                sur les projections du COR&nbsp;2023&nbsp;: T&nbsp;=&nbsp;22 minimise l'erreur
                quadratique vs le solde PAYG projeté aux horizons 2030/2040/2045/2050
                (SSE&nbsp;=&nbsp;0,67).
              </td>
              <td>Calibration sur COR&nbsp;2023</td>
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

      {/* --- Rééquilibrage Équinoxe --- */}
      <section className="hyp-section">
        <h2>Rééquilibrage Équinoxe — proposition du Parti Équinoxe</h2>
        <p>
          Le rééquilibrage Équinoxe est une proposition portée par le{' '}
          <a href="https://parti-equinoxe.fr/contre-budget-2026/" target="_blank" rel="noopener noreferrer">
            parti politique Équinoxe
          </a>{' '}dans le cadre de leur contre-budget 2026. Étant un document
          «&nbsp;d'urgence&nbsp;» sorti pour les élections de 2026, il n'y a pas de
          réformes de fond&nbsp;; néanmoins cette partie de leur proposition me semble
          un prérequis aux réformes de fond telles que proposées par ce modèle, et
          donc y est intégrée.
        </p>
        <p>
          Plutôt que de bêtement couper les retraites au-dessus d'un certain seuil, ils
          proposent d'appliquer un taux de réduction progressif qui s'alourdit à mesure
          que la pension grimpe. Rien n'est retiré en dessous de 1&nbsp;800&nbsp;€/mois&nbsp;;
          l'effort se concentre sur les pensions qui dépassent de loin ce que la génération
          concernée a réellement cotisé. Le total des économies est ~26&nbsp;Md€/an.
        </p>
        <table className="hyp-table hyp-table-compact">
          <thead>
            <tr>
              <th>Pension brute (€/mois)</th>
              <th>Taux de réduction</th>
              <th>Pension après réduction</th>
              <th>Perte mensuelle</th>
            </tr>
          </thead>
          <tbody>
            {EQUINOXE_POINTS.map(p => {
              const rate = equinoxeReductionRate(p)
              return (
                <tr key={p}>
                  <td>{p.toLocaleString()}&nbsp;€</td>
                  <td>{(rate * 100).toFixed(1)}&nbsp;%</td>
                  <td>{Math.round(p * (1 - rate)).toLocaleString()}&nbsp;€</td>
                  <td>{Math.round(p * rate).toLocaleString()}&nbsp;€</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="hyp-note">
          Source&nbsp;: <em>Contre-Budget 2026</em>, Parti Équinoxe. Le taux s'applique
          à la pension totale (step function par tranche, plafonnée à 20&nbsp;% au-delà
          de 4&nbsp;000&nbsp;€/mois).
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
              <td>{(defaults.r_c * 100).toFixed(1)}% réel</td>
              <td>
                Rendement réel des comptes de capitalisation individuels. Un portefeuille
                diversifié 60/40 rapporte historiquement ~3-3,5% réel. Le modèle de base
                utilisait 4,5% — jugé trop optimiste. 3% est conservateur
                mais plus défendable.
              </td>
              <td>UBS Global Investment Returns Yearbook 2025, DMS</td>
            </tr>
            <tr>
              <td>Rendement fonds legacy r<sub>f</sub></td>
              <td>{(defaults.r_f * 100).toFixed(1)}% réel</td>
              <td>
                Rendement réel des actifs du fonds legacy (portefeuille CDC).
                Similaire à un fonds institutionnel diversifié. Note : les actifs
                CDC incluent des participations illiquides (La Poste, infrastructures)
                qui ne génèrent pas de rendement cash immédiat — le modèle surestime
                les revenus du fonds en années 1-5 de ~20-30%.
              </td>
              <td>CDC Rapport annuel, ECB Working Paper</td>
            </tr>
          </tbody>
        </table>
        <div className="hyp-warning">
          <strong>Point de vigilance :</strong> Un fonds de capitalisation de ~2 800 Md€
          (après 20 ans) serait sans précédent historique. À cette échelle, les effets
          d'équilibre général déprimerait les primes de risque actions. Les rendements
          passés ne sont pas extrapolables à cette échelle.
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
              <td>Taux endogène</td>
              <td>{defaults.endogenousRd ? 'Activé' : 'Désactivé'}</td>
              <td>
                Lorsqu'il est activé, le taux d'emprunt augmente automatiquement avec
                le ratio dette/PIB. Le taux d'emprunt n'est pas un paramètre fixe —
                c'est une variable endogène qui réagit à la trajectoire de la dette.
              </td>
              <td>Empirique (crise zone euro 2010-2012)</td>
            </tr>
          </tbody>
        </table>

        <h3>Modèle de prime de risque à 3 paliers</h3>
        <p>
          Le taux d'emprunt augmente par paliers lorsque le ratio dette/PIB total
          (dette existante + dette de transition) dépasse certains seuils :
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
              <td>Les marchés ne s'inquiètent pas. Cf. États-Unis, Italie avant 2010.</td>
            </tr>
            <tr>
              <td>Zone 1</td>
              <td>{defaults.rpThreshold1}% — 200%</td>
              <td>{(defaults.rpSlope1 * 10000).toFixed(0)} bps/pp</td>
              <td>Les marchés commencent à réagir. +2 points de base par point de % de dette/PIB.</td>
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
              <td>Régime de crise. Les marchés paniquent. +10 points de base par point de %.</td>
            </tr>
          </tbody>
        </table>
        <div className="hyp-note">
          <strong>Seuil critique :</strong> Lorsque le taux d'emprunt réel (r<sub>d</sub> - π)
          dépasse le rendement du fonds legacy (r<sub>f</sub>), le spread σ devient négatif.
          À ce stade, la dette s'auto-alimente et ne peut plus être remboursée.
          Avec les valeurs par défaut : σ = 0 quand r<sub>d</sub> = 5%.
        </div>
      </section>

      {/* --- HLM --- */}
      <section className="hyp-section">
        <h2>Liquidation du parc HLM</h2>
        <table className="hyp-table">
          <thead>
            <tr><th>Paramètre</th><th>Valeur</th><th>Explication</th><th>Source</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Parc HLM U<sub>0</sub></td>
              <td>{defaults.U0} millions</td>
              <td>
                Nombre de logements sociaux en France. Le parc décline géométriquement
                au taux ρ.
              </td>
              <td>INSEE, Housing Europe 2025</td>
            </tr>
            <tr>
              <td>Taux de liquidation ρ</td>
              <td>{(defaults.rho * 100).toFixed(0)}%/an</td>
              <td>
                5% = ~265 000 logements vendus par an. Cela représente 28-34% du volume
                total de transactions immobilières en France. Le modèle de base utilisait
                10% (jugé physiquement impossible à ce volume).
              </td>
              <td>notaires de France</td>
            </tr>
            <tr>
              <td>Prix marché P<sub>0</sub></td>
              <td>{defaults.P0} k€</td>
              <td>
                Prix moyen de marché d'un logement social. Moyenne nationale ;
                varie fortement entre IDF (~250k€) et province (~120k€).
              </td>
              <td>INSEE, notaires</td>
            </tr>
            <tr>
              <td>Décote volume</td>
              <td>{defaults.hlmDiscount ? 'Activée' : 'Désactivée'}</td>
              <td>
                Lorsqu'activée, le prix de vente est réduit en fonction du volume vendu.
                Plus on vend, plus les prix baissent (loi de l'offre). Élasticité
                δ = {defaults.delta}, plafonnée à 30% de décote maximum.
              </td>
              <td>Choix de modélisation</td>
            </tr>
            <tr>
              <td>Croissance prix g<sub>h</sub></td>
              <td>{(defaults.g_h * 100).toFixed(1)}% réel</td>
              <td>
                Hausse annuelle des prix immobiliers au-delà de l'inflation.
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
            <tr><th>Paramètre</th><th>Valeur</th><th>Explication</th><th>Source</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Masse salariale W<sub>0</sub></td>
              <td>{defaults.W0.toLocaleString()} Md€</td>
              <td>
                Masse salariale brute totale en France. Croît au taux nominal
                des salaires (inflation + croissance réelle).
              </td>
              <td>INSEE, ACOSS</td>
            </tr>
            <tr>
              <td>Taux salarié τ<sup>s</sup></td>
              <td>{(defaults.tauS * 100).toFixed(1)}%</td>
              <td>
                Cotisation retraite prélevée sur le salaire brut. Dans cette réforme,
                100% va à la capitalisation individuelle dès le Jour 1.
              </td>
              <td>URSSAF</td>
            </tr>
            <tr>
              <td>Taux employeur τ<sup>e</sup></td>
              <td>{(defaults.tauE * 100).toFixed(1)}%</td>
              <td>
                Cotisation retraite payée par l'employeur. Sert d'abord à couvrir
                les pensions legacy ; le surplus va à la capitalisation.
                Pendant la phase de déficit (~20 ans), la totalité va au legacy.
              </td>
              <td>URSSAF</td>
            </tr>
            <tr>
              <td>Floor employeur φ<sub>f</sub></td>
              <td>{(defaults.phiF * 100).toFixed(0)}%</td>
              <td>
                Part minimum des cotisations employeur réservée à la capitalisation,
                même pendant le déficit legacy. À 0%, tout va d'abord au legacy.
              </td>
              <td>Choix de modélisation</td>
            </tr>
          </tbody>
        </table>
        <div className="hyp-warning">
          <strong>Point de vigilance :</strong> Le maintien du taux employeur à 16,5%
          pendant la transition (sans aucun allègement) préserve la structure de coût
          qui fait de la France le pays aux charges patronales les plus élevées de l'OCDE.
          Cela peut supprimer la croissance salariale que le modèle suppose.
        </div>
      </section>

      {/* --- CDC & Transition --- */}
      <section className="hyp-section">
        <h2>Fonds CDC et prélèvement de transition</h2>
        <table className="hyp-table">
          <thead>
            <tr><th>Paramètre</th><th>Valeur</th><th>Explication</th><th>Source</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Actifs CDC F<sub>0</sub></td>
              <td>{defaults.F0} Md€</td>
              <td>
                Valeur des actifs CDC (hors Livret A/Fonds d'Épargne) transférés au
                fonds legacy le Jour 1. Inclut des participations illiquides
                (66% de La Poste, infrastructures) — la valeur réalisable est
                probablement 150-170 Md€.
              </td>
              <td>CDC Rapport annuel</td>
            </tr>
            <tr>
              <td>Taux prélèvement λ</td>
              <td>{(defaults.lambda * 100).toFixed(0)}%</td>
              <td>
                Fraction des flux de capitalisation prélevée pour accélérer le
                remboursement de la dette de transition.
              </td>
              <td>Choix de modélisation</td>
            </tr>
            <tr>
              <td>Activation T<sub>λ</sub></td>
              <td>Année +{defaults.Tlambda}</td>
              <td>
                Le prélèvement ne s'active qu'après {defaults.Tlambda} ans
                (2041), le temps que les comptes de capitalisation aient
                accumulé suffisamment.
              </td>
              <td>Choix de modélisation</td>
            </tr>
            <tr>
              <td>Abattement fiscal A<sub>0</sub></td>
              <td>{defaults.A0} Md€/an</td>
              <td>
                Économies liées à la suppression de l'abattement fiscal de 10%
                sur les revenus de retraite. Croît avec la masse salariale.
              </td>
              <td>PLF, DREES</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* --- Spread --- */}
      <section className="hyp-section">
        <h2>Le spread σ — indicateur clé de viabilité</h2>
        <div className="hyp-formula">
          σ = r<sub>f</sub> - (r<sub>d</sub> - π)
        </div>
        <p>
          Le spread mesure la différence entre ce que le fonds legacy rapporte (r<sub>f</sub>)
          et ce que la dette coûte en termes réels (r<sub>d</sub> - π).
        </p>
        <ul className="hyp-spread-list">
          <li>
            <strong>σ &gt; 0 :</strong> Le fonds gagne plus que le coût de la dette.
            La transition est financièrement viable à long terme.
          </li>
          <li>
            <strong>σ = 0 :</strong> Le fonds gagne exactement le coût de la dette.
            Zone de fragilité — aucune marge de sécurité.
          </li>
          <li>
            <strong>σ &lt; 0 :</strong> La dette coûte plus que le fonds ne rapporte.
            <strong> Spirale de dette auto-alimentée</strong> — la transition échoue.
          </li>
        </ul>
        <p>
          Avec les valeurs par défaut : σ = {defaults.r_f * 100}% -
          ({defaults.r_d_base * 100}% - {defaults.pi * 100}%) = {((defaults.r_f - (defaults.r_d_base - defaults.pi)) * 100).toFixed(1)}%.
          Le spread passe à zéro si r<sub>d</sub> atteint {((defaults.r_f + defaults.pi) * 100).toFixed(0)}%.
        </p>
      </section>

      {/* --- Presets --- */}
      <section className="hyp-section">
        <h2>Les quatre scénarios pré-configurés</h2>
        <div className="preset-explain-grid">
          {Object.entries(PRESETS).map(([key, preset]) => (
            <div key={key} className={`preset-explain-card ${key === 'default' ? 'preset-default' : ''}`}>
              <h3>{preset.label}</h3>
              <p className="preset-desc">{preset.description}</p>
              <div className="preset-params">
                <span>r<sub>c</sub>: {(preset.params.r_c * 100).toFixed(1)}%</span>
                <span>w<sub>r</sub>: {(preset.params.w_r * 100).toFixed(1)}%</span>
                <span>r<sub>d</sub>: {preset.params.endogenousRd ? 'endogène' : (preset.params.r_d_base * 100).toFixed(1) + '% fixe'}</span>
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
        <h2>Interactions entre faiblesses — effets composés</h2>
        <p>
          Les faiblesses ne sont pas indépendantes. Quand plusieurs hypothèses
          sont simultanément trop optimistes, les effets se composent :
        </p>
        <table className="hyp-table">
          <thead>
            <tr><th>Interaction</th><th>Effet</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Rendement surestimé (4,5% → 3%) + emprunt sous-estimé (3,5% → 5%+)</td>
              <td>Le spread s'effondre de +3pp à ~0</td>
            </tr>
            <tr>
              <td>Salaires surestimés (1,5% → 0,7%) + charges employeur maintenues</td>
              <td>Cotisations ~30-50% plus faibles, marché du travail stagne</td>
            </tr>
            <tr>
              <td>Plus de dette → taux plus élevés → plus de dette</td>
              <td>Spirale auto-renforçante (régime σ &lt; 0)</td>
            </tr>
            <tr>
              <td>Dépenses sous-estimées de ~11% (E<sub>0</sub>: 307 vs 345 Md€)</td>
              <td>Obligations legacy plus élevées dès le Jour 1</td>
            </tr>
          </tbody>
        </table>
        <div className="hyp-warning">
          C'est pourquoi le scénario de base utilise des hypothèses prudentes (3% réel,
          0,7% salaires, taux endogène, E<sub>0</sub>=345 Md€). Testez le scénario
          « Stress Test » pour voir ce qui se passe quand plusieurs hypothèses se dégradent
          simultanément.
        </div>
      </section>

      {/* --- Monte Carlo --- */}
      <section className="hyp-section">
        <h2>Simulation Monte Carlo</h2>
        <p>
          Le simulateur propose un mode stochastique qui applique des chocs annuels
          corrélés à quatre paramètres clés : r<sub>c</sub>, r<sub>d</sub>, π, w<sub>r</sub>.
          Les corrélations sont calibrées sur les données empiriques :
        </p>
        <table className="hyp-table hyp-table-compact">
          <thead>
            <tr><th>Paire</th><th>Corrélation</th><th>Logique</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>r<sub>c</sub> ↔ π</td>
              <td>-0,2</td>
              <td>Les rendements réels baissent quand l'inflation monte</td>
            </tr>
            <tr>
              <td>r<sub>d</sub> ↔ π</td>
              <td>+0,6</td>
              <td>Les taux d'emprunt montent avec l'inflation</td>
            </tr>
            <tr>
              <td>r<sub>c</sub> ↔ w<sub>r</sub></td>
              <td>+0,3</td>
              <td>La croissance bénéficie à la fois aux salaires et aux marchés</td>
            </tr>
          </tbody>
        </table>
        <p>
          Les résultats sont affichés sous forme de bandes de confiance (intervalles à 50% et 90%)
          sur les graphiques de dette et de capitalisation. Cela donne une meilleure idée de
          l'incertitude réelle autour des projections déterministes.
        </p>
      </section>

      {/* --- Sources --- */}
      <section className="hyp-section">
        <h2>Sources principales</h2>
        <ul className="hyp-sources">
          <li><strong>DREES</strong> — Distribution des pensions 2022, dépenses de protection sociale</li>
          <li><strong>INSEE</strong> — Comptes nationaux, statistiques salariales, indices de prix immobiliers, projections démographiques</li>
          <li><strong>COR</strong> (Conseil d'Orientation des Retraites) — Projections du système de retraite</li>
          <li><strong>Agence France Trésor (AFT)</strong> — Taux d'emprunt souverain, profil de la dette</li>
          <li><strong>OCDE</strong> — Employment Outlook 2025, Taxing Wages 2025</li>
          <li><strong>UBS/DMS</strong> — Global Investment Returns Yearbook 2025 (rendements historiques)</li>
          <li><strong>BCE/ECB</strong> — Working papers sur l'impact des fonds souverains sur les marchés</li>
          <li><strong>CNAV, AGIRC-ARRCO</strong> — Données de cotisants et de retraités</li>
          <li><strong>Breyer (1989)</strong> — Impossibilité d'une transition Pareto-améliorante PAYG → capitalisation</li>
          <li><strong>Fitch, KBRA</strong> — Notation souveraine française (A+)</li>
          <li><strong>CDC</strong> — Rapport annuel, portefeuille d'actifs</li>
          <li><strong>Housing Europe 2025</strong> — Données sur le parc social français</li>
          <li><strong>Notaires de France</strong> — Volumes de transactions immobilières</li>
        </ul>
      </section>
    </div>
  )
}
