
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
          de retraite — soit ~14% du PIB, le 3e ratio le plus eleve de l'OCDE. Ces dépenses dépassent
	  depuis longtemps déjà les cotisations de retraite, même au sens large (donc intégrant les 
	  sur-cotisations du gouvernement pour la fonction publique et transferts issus du Fonds de 
	  solidarité vieillesse), ne suffit plus depuis longtemps de le payer. Avec presque 7.5% des 
	  retraites financé par les autres postes sociales, et circa 14% par le budget général, c-à-d, 
	  par de la dette, le système est déjà en faillite. 
        </p>
        <p>
          étant donné qu'il s'agit d'un systeme "par repartition", ou les cotisations des actifs paient 
	  les pensions des retraites, doit en plus de son insolvabilité, faire face à une pression demographique 	  croissante : le ratio cotisants/retraites ne cesse de baisser, et son financement principal avec. Cela 
          ne fait qu'augmenter les recours à la dette et donc la charge des intérêts que les français 
          doivent supporter. L'insolvabilté du système est donc structurelle. 
        </p>
        <p>
          Cette transition démographique n'est certes pas nouveau. Par contre, et fort heureusement, 
	  elle s'était entamé dans une contexte d'intensification de l'industrialisiation et donc de 
	  gains immenses de productivité et de richesse, qui ont rendu possible un certain temps d'auto
	  -financer les retraites, y compris à l'échelle d'une population. 
        </p>
        <p>          
          Malheureusement, cela n'a pas duré. Nous avons empillé depuis plusieurs décennies un tel 
          labyrinth des normes et des charges, ces derniers étant principalement pour tenter vainement 
          de financer nos retraites, que notre pays ne connait presque plus la croissance, la productivité 
          stagne, et quant à la production de richesse, n'en parle pas. 
        </p>
        <p>
          On peut appeler ces factors les quatre chévaliers de l'apocalypse financière, qui rôde autour de
          notre système de retraite: ceux qui creuse notre fossé, 1. La pente démographique, qui condamne 
          les systèmes par répartition, et 2. La Dette, symptome de l'échec du système actuel et héraut de 
          notre faillite, et ceux qui nous empêche de s'en sortir, ceux de marchés sclerosés: 3. Le marché
	  du travail, et 4. Le marchée de l'immobilier.   
        </p>
        <p>
          L'excellente site de Joan Larroumec - @larroumecj resume bien la position minable de la France 
          par rapport à ses pairs: https://francetdb.com/, ainsi que le fait que le système de retraites 
          actuelles va droit dans le mur (https://francetdb.com/#retraites). Cette site a vocation de 
          demontrer que même si c'est effectivement très, très, tard, ce n'est pas trop tard. On peut 
          toujours s'en sortir, ce n'est qu'une question d'identifier les arbitrages nécessaires et de 
          les implementer :)
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

      {/* --- The 4 horsemen --- */}
      <section className="intro-section">
        <h2>Les Quatres Chevaliers</h2>
        <p>
        </p>
        <div className="mechanism-grid">
          <div className="mechanism-card">
            <h3>1. La pente démographique</h3>
            <p>
              Comme nous pouvons tous le constater, les français font de moins en moins des enfants. 
	      Dans un régime de financement des retraites par les actifs, c'est une mauvaise nouvelle. 
	      En plus, nous vivons de plus en plus longtemps, ce qui est plutôt une bonne nouvelle, sauf,
	      evidémment, dans un contexte our les actifs, de moins en moins nombreux, doivent financer la
	      train de vie de leurs ainés, de plus en plus nombreaux grâce à la science médicale. 
	      Le ratio cotisants/retraites ne cesse donc de baisser, et son financement principal avec. Cela 	      	      
	      fait méchaniquement augmenter les recours à la dette et donc la charge des intérêts que les 
	      français doivent supporter.           
            </p>
          </div>
          <div className="mechanism-card">
            <h3>2. La Dette</h3>
            <p>
              La consequence directe de cette pente démographique, ainsi que de la générosité irresponsible des 	      
	      générations des politiciens français, est la faillite structurelle de notre system, et le recours
	      chaque année à encore plus de dette. Nous arriverons bientôt au point où nous emprunterons même 
	      pour payer les intérêts de la dette - ce qui ne finit jamais très bien!
            </p>
          </div>
          <div className="mechanism-card">
            <h3>3. Les marchés sclerosés: le travail</h3>
            <p>
              Premier parmi ceux qui nous empêche de s'en sortir est notre marché du travail qui ne marche tout 	      
	      simplement plus. Dans un pays qui protège ses chomeurs plus généreusement que presque aucun autre, 
	      nous faisons tout pour empêcher que les gens deviennent chomeur, puisque cela coute trop cher. 
	      C'est réussi: mais nos entreprises ont bien compris, et n'embauchent moins en France que nulle part 
	      ailleurs. 
	      Il va sans dire que cela met encore plus de pression sur notre pauvre système des retraites, car les 
	      cotisations (et, d'ailleurs, l'impôt sur le revenu et la TVA) sont intimement liés à la masse salariale. 
	      Dans cette simulateur, nous proposons une forte liberalization du marché du travail afin d'augmenter la 
	      masse salariale et, accéssoirement, réduire la dépendance qui commence à gangrener notre modèle social.
            </p>
          </div>
          <div className="mechanism-card">
            <h3>4. Les marchés sclerosés: l'immobilier</h3>
            <p>.
	      Dernièrement, mais loin d'être le moins important de ce qui nous empêche de sortir, est notre marché de
	      l'immobilier, au sens large. Comme le demontre Piketty, l'immobilier français est notre plus grande source 
	      d'inégalité. Il est artificiellement cher car sous-taxé relatif à toute autre chose, et parce que l'offre 
	      est artificiellement baissé par des norms à foison, dont les pire, et de loin, sont les éxigences sociaux.
	      Il est demontré très clairement par des dizaines des études que la liberalisation du bâti permet de baisser 
	      les prix, et, par contre, que le contrôle des loyers est devastateur pour une ville.
	      Reformer la fiscalité de la terre est hors sujet pour cette simulateur, mais nous proposons une forte 
	      liberalization du marché de l'immobilier de faciliter la mobilité et l'obtention des logements qui correspondent
	      réellement à ce que veulent les gens.
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
              Le premier étape est d'acter la justice intergenerationnelle, et de consigner ce model de 
              répartition pur à l'histoire. On cesse de faire payer aux actifs les promesses votés par
              trois générations des retraites à eux-mêmes, sans provision. Chaque génération assume 
              sa propre retraite. 
            </p>
            <p>
              Concrétement, les cotisations "à la charge de l'employé" (mettant de côté la réalité que 
              tous les cotisations sont à la charge de l'employé) seront versés dès le premier jour dans 
              un fond de capitalisation.  Les cotisations employeur resteront dédiés à la paiement des droits 
              acquises.
            </p>
          </div>
          <div className="mechanism-card">
            <h3>2. La Sobriété</h3>
            <p>
              Une génération moins nombreux que ses ainés ne peut pas supporter la charge actuelle 
              de ses ainés, qui, à cause de l'irresponsibilité de nos politiciens des dernièrs 5 
              décennies, depasse aussi de loin ce que cette génération a cotisé.
            </p>
            <p>
              Nous actons donc l'indexation des petites retraites, avec les baisses des pensions 
              proposé par la parti équinoxe (voir page "hypotheses"), et nous supprimons également l'absurdité de l'abattement 
              pour frais forfaitaires dans le chef des personnes qui n'ont pas, en principe, des frais pour 
              toucher leurs retraites.
            </p>
          </div>
          <div className="mechanism-card">
            <h3>3. La Courage</h3>
            <p>
              Le marché du travail français est tellement au point mort que plusiers Presidents ont 
              tenté de s'y attaquer, et ont fléchi au moment critique devant les réclamations souvent
              outranciers des syndicats (qui ne réprèsente qu'une petite fraction des salairiés!). 
              Mais pour générer des cotisations supplémentaires c'est nécesssaire d'augmenter les embauches. 
              Nous abolissons le CDI, nous abolissons les privilèges syndicales (rien n'empêchera 
              un syndicat de se faire voter par la majorité des ouvriers dans une entreprise, pourvu 
              que ce soit par un ballot secret, mais il n'aurons aucun pouvoir de s'y installer autrement
              et fini la boite noire de la CGT, payé par nos impôts), et, mesure facile dans ce pays 
              avec le "filet de sécurité" presque le plus complet du monde, nous instaurons le droit 
              de licencier.
            </p>
            <p>
              Cela génére une hausse important de la croissance et du taux de la participation, 
              générant des importants hausses des cotisations, sans mentioner l'amélioration de la vie 
              de milliers des personnes.  
            </p>
          </div>
          <div className="mechanism-card">
            <h3>4. La Prudence</h3>
            <p>.Le system des logements sociaux est, lui aussi, profondement cassé. Trop des 
              citoyens en réel besoin ne peut pas y acceder, ou souffre de la petite tyrannie 
              d'une bureaucratie trop souvent impitoyable, tandis que trop des copains des partis
              politiques de la gauche en abuse. 
            </p>
            <p>
              Nous reformons le parc social en remplacant les logements avec les subventions, 
              accordés uniquement à ceux qui en ont réellement besoin, en les donnant aussi la liberté
              de s'y installer où ils veulent, dans le logement de leur choix. 
            </p>
            <p>
              De par ce fait, nous abolissons les exigences de logement social, et nous liquidons 
              progressivement le parc social devenu obsolet, afin de libérer des fonds dans l'immédiat 
              pour payer des droits acquis, et minimisant le recours à la dette.              
            </p>
            <p>
              Cela ne baissera en rien les dépenses sur le logement social, mais à la place de payer tout
              un reseau de copinage et des prestataires, souvent au benefice des gens gagnant plusieurs
              fois le SMIC, nous donnerons simplement de l'argent aux français qui en ont besoin. 
            </p>
          </div>
        </div>
      </section>

      {/* --- The Reform Mechanism --- */}
      <section className="intro-section">
        <h2>Quels sont les clés de notre réforme ?</h2>
        <p>
          Un reforme de la financement des retraites en France doit accomplir trois choses à la fois:
          1) Reduire la charge actuelle, qui dépasse de loin notre capacité de paiement
          2) Payer les droits acquises, ainsi réduits
          3) Démarrer la capitalisation pour que les générations futurs puissant eux, aussi, avoir une retraite.
        </p>
        <p>
          Pour arriver à ces trois objectifs, nous avons recours à nos quatre vertues, voir ci-dessus.
        </p>
        <h2>Comment fonctionne la reforme simulee ?</h2>
        <p>
          A partir de 2027, le modele suppose que :
        </p>
        <div className="mechanism-grid">
          <div className="mechanism-card">
            <h3>1. Les cotisations salaries basculent</h3>
            <p>
              Les 11,3% de cotisations "salariales" (bien que <i>tous</i> les cotisations 
              sont prélevés sur la salaire) vont a 100% vers des <strong> comptes de 
              capitalisation individuels</strong> des le Jour 1.
              Cela est relativement faible comme taux, et à terme serait augmenter par 
              des cotisations dits "employeurs". Leur faiblesse initial est acceptable 
              grâce à la magie de la reinvestissement. 
            </p>
          </div>
          <div className="mechanism-card">
            <h3>2. Un fonds legacy absorbe le choc</h3>
            <p>
              Les <strong>220 Md&#8364 d'actifs de la CDC (Caisse des dépôts et des 
              consignations)</strong> (hors Livret A) financent un fonds charge de payer 
              les retraites des generations transitionnelles. Ce fonds recoit aussi les 
              cotisations "employeur", les ventes de logements sociaux et bénéficie des 
              economies de la courbe Equinoxe qui font baisser la note totale.
              Les ventes du parc HLM devraient réaliser au moins <strong>30 Md&#8364; 
              par an (partant de la liquidation de seulement 5% du parc par année), 
              ce qui minimise le recours à la dette. En réalité, on essayerai de réaliser
              une partie bcp plus importante dans les premières années, ce qui reduirait
              encore plus la dette. 
            </p>
          </div>
          <div className="mechanism-card">
            <h3>3. L'Etat emprunte pour combler le deficit</h3>
            <p>
              Pendant les ~20 premieres annees, les cotisations "employeurs", même comblé
              par les revenus du fonds legacy (CDC+HLM) ne suffisent pas (peu étonnant égard
              eu au fait qu'auhourd'hui le budget national entière ne suffit pas!). 
              Le deficit annuel continuera alors d'être couvert par de la <strong>dette
              souveraine</strong> (emissions d'OAT). Par contre, ce cout sera plus justifié
              qu'aujourd'hui parce qu'il facilitera la transition credible et lisible vers
              un system sans dette.
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
        <h2>Les risques majeurs</h2>
        <div className="mechanism-grid">
          <div className="mechanism-card dynamics-card">
            <h3>La dette</h3>
            <p>
              Actuellement, les retraites actuelles sont financés partiellement par de 
              la dette, et les quatres chevaliers de l'apocalypse budgétaire font en sort
              que les retraites futurs le seront d'autant plus. 
              Notre modele repose sur le fait de "cantonner" la dette des retraites dans un 
              structure de capitalisation qui la rend cohérent et lisible. Par contre, le 
              modèle se repose aussi sur l'hypothese, jusqu'ici vrai, que le rendement de 
              la capitalisation depasse le cout de cette dette. 
            </p>
          </div>
          <div className="mechanism-card dynamics-card">
            <h3>Le cout d'emprunt endogene</h3>
            <p>
              Plus l'Etat emprunte, plus les marches exigent un taux eleve. Le modele
              utilise un <strong>taux d'emprunt qui augmente avec le ratio dette/PIB</strong>,
              selon un modele a 3 paliers calibre sur l'experience francaise, italienne
              et americaine. Au-dessus de 300% de dette/PIB, le taux entre en "regime
              de crise". 
              La dotation des actifs de la CDC et des recettes de la liquidation du parc HLM
              nous permets d'éviter une telle crise, inévitable dans le système actuel.
            </p>
          </div>
          <div className="mechanism-card dynamics-card">
            <h3>La liquidation HLM</h3>
            <p>
              5% du parc HLM (265 000 logements/an) est vendu pour financer le fonds
              legacy (parametre que vous pouvez changer). En théorie, vendre autant 
              de logements d'un coup fait baisser les prix. Nous minimisons cela
              en faisant l'hypothèse d'une liberalisation forte du marché du bati, ce
              qui devrait faire que, dans un marché d'immobilier écrasé artificiéllement 
              comme celui de la France, que les prix ne baisse pas tellement. 
              Par précaution,<strong> le modele applique une decote très conservatrice et
              dependante du volume, plafonnee a 30%</strong> (parametre que vous pouvez 
              aussi changer).
            </p>
          </div>
          <div className="mechanism-card dynamics-card">
            <h3>Le rendement de la capitalisation</h3>
            <p>
              L'hypothese de base de 3% reel est dans la fourchette historique, même 
              relativement conservatrice: le fond souverain Norvegien, pesant déjà plus 
              que 1,5 Tn&#8364;, a realisé >6% par an depuis sa conception. 
              Idem pour Temasek, la géante fonds Singapourien. 
              Les fonds de pension Américains, Canadien, et Australiens, dont plusieurs
              excède la centaine des MDs et qui pèse collectivement plus que 2 Tn&#8364;
              en font un rendement similair. 
              Mais si le fonds ne réalisait pas autant, ce sera une risque majeur de cette
              modèle. Il serait de lors impératif que le fonds soit réellement indépendante 
              de nos politiciens et confiés aux gestionnaires professionelles, tout comme
              chacun des autres fonds cités (et à l'opposé de la CDC!). 
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

          </div>
          <div className="limitation-item limitation-severe">
            <h4>3. Le rendement de la capitalisation est incertain</h4>
            <p>

            </p>

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
