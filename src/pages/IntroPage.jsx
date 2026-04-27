
import { useState, useEffect, useRef, useMemo } from 'react'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts'
// v1.0a: was simulation-engine.js (v0.11) + bundled PRESETS/extractKPIs.
// Now imports from the renamed engine + presets module.
import { runSimulation } from '../simulation-engine.js'
import { extractKPIs, PRESETS } from '../presets.js'
import './IntroPage.css'

// French number formatter
const fmt = (n, decimals = 0) =>
  new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)

const DEMOGRAPHIC_DATA = [
  { year: 1960, ratio: 4.0 }, { year: 1970, ratio: 3.5 }, { year: 1980, ratio: 3.0 },
  { year: 1990, ratio: 2.7 }, { year: 2000, ratio: 2.4 }, { year: 2010, ratio: 2.0 },
  { year: 2020, ratio: 1.7 }, { year: 2030, ratio: 1.5 }, { year: 2040, ratio: 1.3 },
  { year: 2050, ratio: 1.2 },
]

const SCROLL_CARDS = [
  { id: 'horse-demo',    chartKey: 'demographie' },
  { id: 'horse-debt',    chartKey: 'dette-traj' },
  { id: 'horse-travail', chartKey: 'shift' },
  { id: 'horse-immo',   chartKey: 'hlm' },
  { id: 'reform-1',     chartKey: 'shift' },
  { id: 'reform-2',     chartKey: 'legacy-capi' },
  { id: 'reform-3',     chartKey: 'dette-peak' },
  { id: 'reform-4',     chartKey: 'levy' },
]

const AX = { fontSize: 12, fill: 'var(--text-secondary)' }
const MT = { bottom: 24, top: 8, left: 4, right: 8 }

function ScrollChart({ chartKey, chartData, peakDebtYear, debtFreeYear }) {
  if (!chartData) return null
  const xAxis = { dataKey: 'year', tick: { fontSize: 12 }, label: { value: 'Année', position: 'insideBottom', offset: -5, style: AX } }
  switch (chartKey) {
    case 'demographie':
      return (<>
        <p className="scrolly-chart-title">Ratio cotisants / retraités</p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={DEMOGRAPHIC_DATA} margin={MT}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis {...xAxis} />
            <YAxis tick={{ fontSize: 12 }} width={40} domain={[0, 4.5]} />
            <Tooltip formatter={v => v.toFixed(1)} labelFormatter={l => `Année ${l}`} />
            <ReferenceLine y={1} stroke="var(--color-danger)" strokeDasharray="6 3" label={{ value: 'Seuil 1:1', fill: 'var(--color-danger)', fontSize: 11 }} />
            <Line type="monotone" dataKey="ratio" stroke="var(--accent-sienna)" strokeWidth={3} dot={{ r: 4, fill: 'var(--accent-sienna)' }} name="Ratio" />
          </LineChart>
        </ResponsiveContainer>
      </>)
    case 'dette-traj':
    case 'dette-peak':
      return (<>
        <p className="scrolly-chart-title">Dette de transition (Md€)</p>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={MT}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis {...xAxis} />
            <YAxis tick={{ fontSize: 12 }} width={55} />
            <Tooltip formatter={v => `${Math.round(v)} Md€`} labelFormatter={l => `Année ${l}`} />
            {peakDebtYear && <ReferenceLine x={peakDebtYear} stroke="var(--color-danger)" strokeDasharray="4 4" label={{ value: 'Pic', position: 'top', fontSize: 11, fill: 'var(--color-danger)' }} />}
            {debtFreeYear && <ReferenceLine x={debtFreeYear} stroke="var(--color-success)" strokeDasharray="4 4" label={{ value: 'Remb.', position: 'top', fontSize: 11, fill: 'var(--color-success)' }} />}
            <Area type="monotone" dataKey="debt" fill="#fecaca" stroke="#dc2626" strokeWidth={2} name="Dette (Md€)" />
          </AreaChart>
        </ResponsiveContainer>
      </>)
    case 'shift':
      return (<>
        <p className="scrolly-chart-title">Part des actifs en capitalisation</p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={MT}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis {...xAxis} />
            <YAxis tick={{ fontSize: 12 }} width={45} tickFormatter={v => `${(v * 100).toFixed(0)}%`} domain={[0, 1]} />
            <Tooltip formatter={v => `${(v * 100).toFixed(1)}%`} labelFormatter={l => `Année ${l}`} />
            <ReferenceLine y={0.5} stroke="var(--border-color)" strokeDasharray="4 4" label={{ value: '50%', fill: 'var(--text-secondary)', fontSize: 11 }} />
            <Line type="monotone" dataKey="shareWorkersCapi" stroke="var(--accent-sienna)" strokeWidth={3} dot={false} name="Part capitalisation" />
          </LineChart>
        </ResponsiveContainer>
      </>)
    case 'hlm':
      return (<>
        <p className="scrolly-chart-title">Produit annuel des ventes HLM (Md€)</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={MT}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis {...xAxis} />
            <YAxis tick={{ fontSize: 12 }} width={45} />
            <Tooltip formatter={v => `${v.toFixed(1)} Md€`} labelFormatter={l => `Année ${l}`} />
            <Bar dataKey="hlmProceeds" fill="var(--accent-sienna)" name="HLM (Md€)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </>)
    case 'legacy-capi':
      return (<>
        <p className="scrolly-chart-title">Dépenses legacy → capitalisation (Md€)</p>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData} margin={MT}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis {...xAxis} />
            <YAxis tick={{ fontSize: 12 }} width={55} />
            <Tooltip formatter={v => `${typeof v === 'number' ? v.toFixed(1) : v} Md€`} labelFormatter={l => `Année ${l}`} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
            <Area type="monotone" dataKey="legacyExp" stackId="p" fill="#fca5a5" stroke="#ef4444" name="Pensions legacy" />
            <Area type="monotone" dataKey="capiPayout" stackId="p" fill="#86efac" stroke="#059669" name="Pensions capitalisation" />
          </ComposedChart>
        </ResponsiveContainer>
      </>)
    case 'levy':
      return (<>
        <p className="scrolly-chart-title">Prélèvement + remboursements (Md€)</p>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData} margin={MT}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis {...xAxis} />
            <YAxis tick={{ fontSize: 12 }} width={55} />
            <Tooltip formatter={v => `${typeof v === 'number' ? v.toFixed(1) : v} Md€`} labelFormatter={l => `Année ${l}`} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
            <Bar dataKey="levy" fill="var(--accent-sienna)" name="Prélèvement (Md€)" radius={[2, 2, 0, 0]} />
            <Line type="monotone" dataKey="repaid" stroke="#059669" strokeWidth={2} dot={false} name="Remboursements (Md€)" />
          </ComposedChart>
        </ResponsiveContainer>
      </>)
    default:
      return null
  }
}

export default function IntroPage({ navigateTo }) {
  // Run baseline scenario to show dynamic numbers
  const baseline = useMemo(() => {
    const results = runSimulation(PRESETS.v1_default.params)
    const kpis = extractKPIs(results)
    return { results, kpis }
  }, [])

  const k = baseline.kpis

  // v1.0a: row-field renames vs v0.11. `repaid` is not exposed in v1.0a row
  // schema, so we approximate it as max(0, netFlow_t) — the system's annual
  // repayment capacity in surplus years. Sufficient for this didactic chart.
  const chartDataFull = useMemo(() => baseline.results.map(r => ({
    year: r.year, debt: r.D_t, shareWorkersCapi: r.sigma_capi_t,
    hlmProceeds: r.H_t_proceeds, legacyExp: r.legacyExp_t, capiPayout: r.capiPayout_t,
    levy: r.levy_t, repaid: Math.max(0, r.netFlow_t),
  })), [baseline.results])

  const [activeCard, setActiveCard] = useState('horse-demo')
  const [displayedKey, setDisplayedKey] = useState('horse-demo')
  const [fading, setFading] = useState(false)
  const cardRefs = useRef({})

  useEffect(() => {
    const observers = []
    SCROLL_CARDS.forEach(({ id }) => {
      const el = cardRefs.current[id]
      if (!el) return
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveCard(id) },
        { root: null, rootMargin: '-5% 0px -40% 0px', threshold: 0 }
      )
      obs.observe(el)
      observers.push(obs)
    })
    return () => observers.forEach(o => o.disconnect())
  }, [])

  useEffect(() => {
    setFading(true)
    const t = setTimeout(() => { setDisplayedKey(activeCard); setFading(false) }, 150)
    return () => clearTimeout(t)
  }, [activeCard])

  const activeChartKey = SCROLL_CARDS.find(c => c.id === displayedKey)?.chartKey

  return (
    <div className="intro-page">

      {/* --- Hero --- */}
      <section className="intro-hero">
        <h2>Pourquoi ce simulateur ?</h2>
        <p>
          La France consacre environ <strong>345 milliards d'euros par an</strong> aux pensions
          de retraite &mdash; soit environ 14&nbsp;% du PIB selon les données OCDE (dépenses
          vieillesse élargies&nbsp;; le seul poste des pensions contributives représente
          environ 12&nbsp;% du PIB dans le modèle), le 3<sup>e</sup> ratio le plus élevé de
          l'OCDE. Ces dépenses dépassent depuis longtemps les cotisations de retraite, même
          au sens large (intégrant les sur-cotisations du gouvernement pour la fonction
          publique et les transferts du Fonds de solidarité vieillesse). Avec près de
          7,5&nbsp;% des retraites financées par d'autres postes sociaux et environ 14&nbsp;%
          par le budget général &mdash; c'est-à-dire par la dette &mdash; le système est déjà
          en faillite structurelle.
        </p>
        <p>
          S'agissant d'un système par répartition, où les cotisations des actifs paient les
          pensions des retraités, il doit en plus de son insolvabilité faire face à une
          pression démographique croissante&nbsp;: le ratio cotisants/retraités ne cesse de
          baisser, et son financement principal avec lui. Cela ne fait qu'augmenter le
          recours à la dette et donc la charge des intérêts que les Français doivent
          supporter. L'insolvabilité du système est donc structurelle.
        </p>
        <p>
          Cette transition démographique n'est certes pas nouvelle. Fort heureusement, elle
          s'était entamée dans un contexte d'intensification de l'industrialisation et donc
          de gains immenses de productivité et de richesse, qui ont rendu possible pendant
          un certain temps l'auto-financement des retraites à l'échelle d'une population.
        </p>
        <p>
          Malheureusement, cela n'a pas duré. Nous avons empilé depuis plusieurs décennies
          un tel labyrinthe de normes et de charges &mdash; principalement pour tenter
          vainement de financer nos retraites &mdash; que notre pays ne connaît presque plus
          la croissance, la productivité stagne, et quant à la production de richesse, n'en
          parlons pas.
        </p>
        <p>
          On peut appeler ces facteurs les quatre cavaliers de l'apocalypse financière qui
          rôdent autour de notre système de retraite. Ceux qui creusent notre fossé&nbsp;:
          1. la pente démographique, qui condamne les systèmes par répartition, et 2. la
          dette, symptôme de l'échec du système actuel et héraut de notre faillite. Ceux
          qui nous empêchent de nous en sortir, les marchés sclérosés&nbsp;: 3. le marché
          du travail, et 4. le marché de l'immobilier.
        </p>
        <p>
          L'excellent site de Joan Larroumec (@larroumecj) résume bien la position peu
          enviable de la France par rapport à ses pairs&nbsp;:{' '}
          <a href="https://francetdb.com/" target="_blank" rel="noopener noreferrer">francetdb.com</a>,
          ainsi que le fait que le système de retraites actuel va droit dans le mur
          (<a href="https://francetdb.com/#retraites" target="_blank" rel="noopener noreferrer">francetdb.com/#retraites</a>).
          Ce site a vocation à démontrer que même s'il est effectivement très, très tard,
          il n'est pas trop tard. On peut toujours s'en sortir&nbsp;: ce n'est qu'une
          question d'identifier les arbitrages nécessaires et de les mettre en œuvre.
        </p>
        <p>
          Ce simulateur explore un scénario radical&nbsp;: <strong>la transition complète
          vers un système par capitalisation</strong>, où chaque travailleur accumule un
          capital personnel financé par ses propres cotisations. Le modèle suit les
          34 équations d'un document technique (<em>cdc_legacy_fund_model.md</em>) qui
          décrit les mécanismes financiers de cette transition sur 70 ans.
        </p>
        <p className="intro-caveat">
          Ce n'est pas une prédiction. C'est un outil d'exploration&nbsp;: il rend visibles
          les mécanismes, les tensions et les compromis d'une telle réforme.
        </p>
      </section>

      {/* --- Scrollytelling: Horsemen + Virtues + Reform --- */}
      <div className="scrolly-container">
        <div className="scrolly-narrative">

          <h2 className="scrolly-section-title">Les Quatre Cavaliers</h2>

          <div className="scroll-card mechanism-card" ref={el => { cardRefs.current['horse-demo'] = el }}>
            <h3>1. La pente démographique</h3>
            <p>
              Comme nous pouvons tous le constater, les Français font de moins en moins
              d'enfants. Dans un régime de financement des retraites par les actifs, c'est
              une mauvaise nouvelle. De plus, nous vivons de plus en plus longtemps &mdash;
              ce qui est plutôt une bonne nouvelle, sauf, évidemment, dans un contexte où
              les actifs, de moins en moins nombreux, doivent financer le train de vie de
              leurs aînés, de plus en plus nombreux grâce à la science médicale. Le ratio
              cotisants/retraités ne cesse donc de baisser, et son financement principal
              avec lui. Cela fait mécaniquement augmenter le recours à la dette, et donc
              la charge des intérêts que les Français doivent supporter.
            </p>
          </div>

          <div className="scroll-card mechanism-card" ref={el => { cardRefs.current['horse-debt'] = el }}>
            <h3>2. La dette</h3>
            <p>
              La conséquence directe de cette pente démographique, ainsi que de la
              générosité irresponsable de plusieurs générations de politiciens français,
              est la faillite structurelle de notre système et le recours chaque année à
              toujours plus de dette. Nous arriverons bientôt au point où nous emprunterons
              même pour payer les intérêts de la dette &mdash; ce qui ne finit jamais très
              bien.
            </p>
          </div>
          <div className="scroll-card mechanism-card" ref={el => { cardRefs.current['horse-travail'] = el }}>
            <h3>3. Les marchés sclérosés&nbsp;: le travail</h3>
            <p>
              Premier parmi ceux qui nous empêchent de nous en sortir, notre marché du
              travail ne fonctionne tout simplement plus. Dans un pays qui protège ses
              chômeurs plus généreusement que presque aucun autre, nous faisons tout pour
              empêcher que les gens deviennent chômeurs, puisque cela coûte trop cher.
              C'est réussi&nbsp;: mais nos entreprises ont bien compris, et n'embauchent
              moins nulle part ailleurs qu'en France. Il va sans dire que cela met encore
              plus de pression sur notre pauvre système de retraites, car les cotisations
              (et d'ailleurs l'impôt sur le revenu et la TVA) sont intimement liées à la
              masse salariale. Dans ce simulateur, nous proposons une forte libéralisation
              du marché du travail afin d'augmenter la masse salariale et, accessoirement,
              de réduire la dépendance qui commence à gangrener notre modèle social.
            </p>
          </div>
          <div className="scroll-card mechanism-card" ref={el => { cardRefs.current['horse-immo'] = el }}>
            <h3>4. Les marchés sclérosés&nbsp;: l'immobilier</h3>
            <p>
              Enfin, mais loin d'être le moins important des facteurs qui nous empêchent
              de nous en sortir, notre marché de l'immobilier au sens large. Comme le
              démontre Piketty, l'immobilier français est notre plus grande source
              d'inégalité. Il est artificiellement cher car sous-taxé relativement à
              toute autre chose, et parce que l'offre est artificiellement réduite par
              des normes à foison, dont les pires, et de loin, sont les exigences
              sociales. Des dizaines d'études démontrent très clairement que la
              libéralisation du bâti permet de faire baisser les prix, et qu'à l'inverse
              le contrôle des loyers est dévastateur pour une ville. Réformer la
              fiscalité de la terre dépasse le cadre de ce simulateur, mais nous
              proposons une forte libéralisation du marché de l'immobilier afin de
              faciliter la mobilité et l'obtention de logements qui correspondent
              réellement à ce que veulent les gens.
            </p>
          </div>

          {/* === Virtues interlude — no scroll refs, chart stays on hlm === */}
          <div className="scrolly-interlude">
            <h2 className="scrolly-section-title">Quatre vertus cardinales au secours</h2>
            <p>
              L'hypothèse de ce simulateur est que la France possède les moyens de s'en
              sortir, et notamment que nous pourrions nous appuyer sur quatre vertus
              budgétaires&nbsp;:
            </p>
            <div className="mechanism-grid">
              <div className="mechanism-card">
            <h3>1. La Justice</h3>
            <p>
              La première étape consiste à acter la justice intergénérationnelle et à
              consigner le modèle de répartition pur à l'histoire. On cesse de faire
              payer aux actifs les promesses votées par trois générations de retraités à
              eux-mêmes, sans provision. Chaque génération assume sa propre retraite.
            </p>
            <p>
              Concrètement, les cotisations «&nbsp;à la charge de l'employé&nbsp;» (en
              mettant de côté la réalité que toutes les cotisations sont à la charge de
              l'employé) seront versées dès le premier jour dans un fonds de
              capitalisation. Les cotisations employeur resteront dédiées au paiement
              des droits acquis.
            </p>
          </div>
          <div className="mechanism-card">
            <h3>2. La Sobriété</h3>
            <p>
              Une génération moins nombreuse que ses aînés ne peut pas supporter la
              charge actuelle de ceux-ci qui, à cause de l'irresponsabilité de nos
              politiciens des cinq dernières décennies, dépasse aussi de loin ce que
              cette génération a cotisé.
            </p>
            <p>
              Nous actons donc l'indexation des petites retraites, avec les baisses des
              pensions proposées par le parti Équinoxe (voir page «&nbsp;Hypothèses&nbsp;»),
              et nous supprimons également l'absurdité de l'abattement pour frais
              forfaitaires dans le chef des personnes qui n'ont pas, en principe, de
              frais pour toucher leurs retraites.
            </p>
          </div>
          <div className="mechanism-card">
            <h3>3. Le Courage</h3>
            <p>
              Le marché du travail français est tellement au point mort que plusieurs
              présidents ont tenté de s'y attaquer et ont fléchi au moment critique
              devant les réclamations souvent outrancières des syndicats (qui ne
              représentent qu'une petite fraction des salariés). Mais pour générer des
              cotisations supplémentaires, il est nécessaire d'augmenter les embauches.
              Nous abolissons le CDI, nous abolissons les privilèges syndicaux (rien
              n'empêchera un syndicat de se faire élire par la majorité des ouvriers
              d'une entreprise, pourvu que ce soit par un scrutin à bulletin secret,
              mais il n'aura aucun pouvoir de s'y installer autrement &mdash; fini la
              boîte noire de la CGT payée par nos impôts), et, mesure facile dans ce
              pays au filet de sécurité parmi les plus complets du monde, nous
              instaurons le droit de licencier.
            </p>
            <p>
              Cela génère une hausse importante de la croissance et du taux de
              participation, ainsi que d'importantes hausses de cotisations, sans
              mentionner l'amélioration de la vie de milliers de personnes.
            </p>
          </div>
          <div className="mechanism-card">
            <h3>4. La Prudence</h3>
            <p>
              Le système des logements sociaux est lui aussi profondément cassé. Trop
              de citoyens en réel besoin ne peuvent pas y accéder, ou souffrent de la
              petite tyrannie d'une bureaucratie trop souvent impitoyable, tandis que
              trop de copains des partis politiques de gauche en abusent.
            </p>
            <p>
              Nous réformons le parc social en remplaçant les logements par des
              subventions, accordées uniquement à ceux qui en ont réellement besoin,
              en leur donnant aussi la liberté de s'installer où ils veulent, dans le
              logement de leur choix.
            </p>
            <p>
              Par la même occasion, nous abolissons les exigences de logement social
              et nous liquidons progressivement le parc social devenu obsolète, afin
              de libérer des fonds dans l'immédiat pour payer les droits acquis et
              minimiser le recours à la dette.
            </p>
            <p>
              Cela ne réduira en rien les dépenses consacrées au logement social, mais
              à la place de payer tout un réseau de copinage et de prestataires,
              souvent au bénéfice de gens gagnant plusieurs fois le SMIC, nous
              donnerons simplement de l'argent aux Français qui en ont besoin.
            </p>
          </div>
            </div>
          </div>

          {/* === Reform intro === */}
          <div className="scrolly-interlude">
            <h2 className="scrolly-section-title">Les Clés de la Réforme</h2>
            <p>
              Une réforme du financement des retraites en France doit accomplir trois
              choses à la fois&nbsp;:
            </p>
            <ol>
              <li>Réduire la charge actuelle, qui dépasse de loin notre capacité de paiement&nbsp;;</li>
              <li>Payer les droits acquis, ainsi réduits&nbsp;;</li>
              <li>Démarrer la capitalisation pour que les générations futures puissent, elles aussi, avoir une retraite.</li>
            </ol>
            <p>
              Pour atteindre ces trois objectifs, nous avons recours à nos quatre vertus,
              voir ci-dessus.
            </p>
            <h3>Comment fonctionne la réforme simulée ?</h3>
            <p>À partir de 2026, le modèle suppose que&nbsp;:</p>
          </div>

          <div className="scroll-card mechanism-card" ref={el => { cardRefs.current['reform-1'] = el }}>
            <h3>1. Les cotisations salariés basculent — progressivement, par cohorte</h3>
            <p>
              Les 11,3&nbsp;% de cotisations «&nbsp;salariales&nbsp;» (bien que{' '}
              <i>toutes</i> les cotisations soient prélevées sur le salaire) vont vers
              des <strong>comptes de capitalisation individuels</strong>, mais
              <strong> uniquement pour les actifs sous un certain âge en 2026</strong>
              {' '}(50&nbsp;ans par défaut). Les plus âgés conservent 100&nbsp;% de leurs
              droits en répartition jusqu'à leur départ à la retraite. La part basculée
              croît linéairement au fur et à mesure que les cohortes legacy s'éteignent&nbsp;:
              ~65&nbsp;% la première année, 100&nbsp;% après ~15&nbsp;ans. Le paramètre est
              réglable dans le simulateur ; «&nbsp;Aucun&nbsp;» reproduit le basculement
              immédiat du document technique original.
            </p>
          </div>

          <div className="scroll-card mechanism-card" ref={el => { cardRefs.current['reform-2'] = el }}>
            <h3>2. Un fonds legacy absorbe le choc</h3>
            <p>
              Les <strong>220&nbsp;Md€ d'actifs de la CDC (Caisse des dépôts et
              consignations)</strong> (hors Livret A) financent un fonds chargé de
              payer les retraites des générations transitoires. Ce fonds reçoit aussi
              les cotisations «&nbsp;employeur&nbsp;» et les produits des ventes de
              logements sociaux, et bénéficie des économies de la courbe Équinoxe qui
              font baisser la note totale. Les ventes du parc HLM devraient rapporter
              <strong> environ 30&nbsp;Md€ par an en moyenne</strong> (à partir de la
              liquidation de seulement 5&nbsp;% du parc par année), ce qui minimise
              le recours à la dette. En réalité, on essaierait de réaliser une part
              bien plus importante dans les premières années, ce qui réduirait encore
              davantage la dette.
            </p>
          </div>

          <div className="scroll-card mechanism-card" ref={el => { cardRefs.current['reform-3'] = el }}>
            <h3>3. L'État emprunte pour combler le déficit</h3>
            <p>
              Pendant les ~20 premières années, les cotisations «&nbsp;employeurs&nbsp;»,
              même complétées par les revenus du fonds legacy (CDC + HLM), ne suffisent
              pas (peu étonnant, eu égard au fait qu'aujourd'hui le budget national
              entier ne suffit pas&nbsp;!). Le déficit annuel continuera alors d'être
              couvert par de la <strong>dette souveraine</strong> (émissions d'OAT).
              En revanche, ce coût sera plus justifié qu'aujourd'hui parce qu'il
              facilitera une transition crédible et lisible vers un système sans dette.
            </p>
          </div>

          <div className="scroll-card mechanism-card" ref={el => { cardRefs.current['reform-4'] = el }}>
            <h3>4. Un prélèvement accélère le remboursement</h3>
            <p>
              Une fois que les premières cohortes éligibles à la capitalisation commencent
              à cotiser (année&nbsp;16 avec un cutoff à 50&nbsp;ans — cela laisse une phase
              de <em>pure-compounding</em> pendant laquelle les pots capi grossissent sans
              être ponctionnés), un <strong>prélèvement de 30&nbsp;%</strong> sur les flux
              de capitalisation est redirigé vers le remboursement de la dette de transition.
              C'est le principal levier pour atteindre la dette zéro.
            </p>
          </div>

        </div>

        <div className="scrolly-sticky">
          <div style={{ opacity: fading ? 0 : 1, transition: 'opacity 0.15s ease', width: '100%' }}>
            <ScrollChart
              chartKey={activeChartKey}
              chartData={chartDataFull}
              peakDebtYear={k.peakDebtYear}
              debtFreeYear={k.debtFreeYear}
            />
          </div>
        </div>

      </div>

      {/* --- Risques majeurs --- */}
      <section className="intro-section">
        <h2>Les risques majeurs</h2>
        <div className="mechanism-grid">
          <div className="mechanism-card dynamics-card">
            <h3>La dette</h3>
            <p>
              Actuellement, les retraites sont financées partiellement par de la dette,
              et les quatre cavaliers de l'apocalypse budgétaire font en sorte que les
              retraites futures le seront d'autant plus. Notre modèle repose sur le
              fait de «&nbsp;cantonner&nbsp;» la dette des retraites dans une structure
              de capitalisation qui la rend cohérente et lisible. En revanche, le
              modèle se repose aussi sur l'hypothèse, jusqu'ici vraie, que le rendement
              de la capitalisation dépasse le coût de cette dette.
            </p>
          </div>
          <div className="mechanism-card dynamics-card">
            <h3>Le coût d'emprunt endogène</h3>
            <p>
              Plus l'État emprunte, plus les marchés exigent un taux élevé. Le modèle
              utilise un <strong>taux d'emprunt qui augmente avec le ratio dette/PIB</strong>,
              selon un modèle à 3 paliers calibré sur l'expérience française, italienne
              et américaine. Au-dessus de 300&nbsp;% de dette/PIB, le taux entre en
              «&nbsp;régime de crise&nbsp;». La dotation des actifs de la CDC et les
              recettes de la liquidation du parc HLM nous permettent d'éviter une telle
              crise, pourtant inévitable dans le système actuel.
            </p>
          </div>
          <div className="mechanism-card dynamics-card">
            <h3>La liquidation HLM</h3>
            <p>
              5&nbsp;% du parc HLM (265&nbsp;000 logements/an) est vendu pour financer
              le fonds legacy (paramètre que vous pouvez modifier). En théorie, vendre
              autant de logements d'un coup fait baisser les prix. Nous minimisons cet
              effet en faisant l'hypothèse d'une libéralisation forte du marché du
              bâti, qui devrait faire que, dans un marché immobilier écrasé
              artificiellement comme celui de la France, les prix ne baissent pas
              tellement. Par précaution, <strong>le modèle applique une décote très
              conservatrice et dépendante du volume, plafonnée à 30&nbsp;%</strong>
              {' '}(paramètre que vous pouvez également modifier).
            </p>
          </div>
          <div className="mechanism-card dynamics-card">
            <h3>Le rendement de la capitalisation</h3>
            <p>
              L'hypothèse de base de 3&nbsp;% réel se situe dans la fourchette
              historique, et même relativement conservatrice&nbsp;: le fonds souverain
              norvégien, pesant déjà plus de <strong>1&nbsp;500&nbsp;Md€</strong>, a
              réalisé au-delà de 6&nbsp;% par an depuis sa création. Idem pour Temasek,
              le géant fonds singapourien. Les fonds de pension américains, canadiens
              et australiens, dont plusieurs dépassent la centaine de milliards et qui
              pèsent collectivement plus de <strong>2&nbsp;000&nbsp;Md€</strong>,
              affichent un rendement similaire. Mais si le fonds ne réalisait pas un
              tel rendement, ce serait un risque majeur pour ce modèle. Il serait dès
              lors impératif que le fonds soit réellement indépendant de nos
              politiciens et confié à des gestionnaires professionnels, tout comme
              chacun des autres fonds cités (et à l'opposé de la CDC&nbsp;!).
            </p>
          </div>
        </div>
      </section>

      {/* --- Baseline Results --- */}
      <section className="intro-section">
        <h2>Que montre le scénario de base ?</h2>
        <p>
          Avec les hypothèses par défaut (rendement capitalisation 3&nbsp;% réel,
          croissance salariale 0,7&nbsp;% réel, taux d'emprunt endogène, courbe
          Équinoxe)&nbsp;:
        </p>
        <div className="baseline-grid">
          <div className="baseline-card">
            <div className="baseline-label">Dette pic</div>
            <div className="baseline-value">{fmt(k.peakDebt, 0)} Md€</div>
            <div className="baseline-sub">Atteinte en {k.peakDebtYear}</div>
          </div>
          <div className="baseline-card">
            <div className="baseline-label">Année sans dette</div>
            <div className="baseline-value">{k.debtFreeYear || 'Jamais'}</div>
            <div className="baseline-sub">Avec prélèvement 30&nbsp;% dès Y+15</div>
          </div>
          <div className="baseline-card">
            <div className="baseline-label">Intérêts cumulés</div>
            <div className="baseline-value">{fmt(k.totalInterest, 0)} Md€</div>
            <div className="baseline-sub">Le coût total de la transition</div>
          </div>
          <div className="baseline-card">
            <div className="baseline-label">Pot capitalisation (réel)</div>
            <div className="baseline-value">{fmt(k.finalCapiReal, 0)} Md€</div>
            <div className="baseline-sub">En euros constants 2026</div>
          </div>
          <div className="baseline-card">
            <div className="baseline-label">Spread minimum</div>
            <div className={`baseline-value ${k.minSpread > 0 ? 'spread-ok' : 'spread-bad'}`}>
              {fmt(k.minSpread * 100, 2)}&nbsp;%
            </div>
            <div className="baseline-sub">{k.minSpread > 0 ? 'Toujours positif' : 'Passe en négatif — zone de danger'}</div>
          </div>
          <div className="baseline-card">
            <div className="baseline-label">Économies Équinoxe</div>
            <div className="baseline-value">{fmt(k.S0, 0)} Md€/an</div>
            <div className="baseline-sub">Réductions progressives des pensions élevées</div>
          </div>
        </div>
      </section>

      {/* --- CTA --- */}
      <section className="intro-section intro-cta">
        <h2>Explorer le simulateur</h2>
        <p>
          Utilisez les curseurs pour tester différentes hypothèses. Chaque paramètre
          a une infobulle explicative. Quatre scénarios préconfigurés sont disponibles,
          du scénario de base au stress test.
        </p>
        <div className="cta-buttons">
          <button className="cta-btn cta-primary" onClick={() => navigateTo('simulateur')}>
            Ouvrir le simulateur
          </button>
          <button className="cta-btn cta-secondary" onClick={() => navigateTo('hypotheses')}>
            Voir les hypothèses
          </button>
        </div>
      </section>
    </div>
  )
}
