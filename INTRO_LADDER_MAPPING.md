# Intro Ladder — mapping des 5 étapes vers les presets / modes canoniques

Le nouveau Intro Page restructuré présente 5 scénarios pédagogiques. Aucun
preset existant ne correspond exactement à chacun ; la stratégie retenue
(par décision utilisateur) est : **partir de UI_CONFIG + appliquer le mode
canonique pertinent**, et documenter ici le mapping.

UI_CONFIG = `{ ...DEFAULT_CONFIG, cashFlowMode: 'balanced', geKneeRatio: 3.0, geFloorRatio: 8.0 }`
(défini dans `src/presets.js`).

| # | Étape                          | Preset / mode canonique le plus proche                                | Différentiels                                                                                |
|---|--------------------------------|-----------------------------------------------------------------------|----------------------------------------------------------------------------------------------|
| 1 | Système actuel                 | *(aucun)* — dérivation du contrefactuel + `fiscalTransferMode:'full'` | `useEquinoxe:false`, `enableCapi:false`, `hlmDiscount:false`, `delta/rho/lambda=0`, `employmentRateTarget=0.69`, démographie réaliste |
| 2 | Rééquilibrage Équinoxe         | `equinoxeOnly`                                                        | Phasing 10 ans (`phased-10y`) au lieu d'immediate ; `fiscalTransferMode:'full'` conservé |
| 3 | Mode Suédois                   | `v1_default` + `swedenMode:true` (toggle canonique App.jsx l.400)    | `swedenABM:true`, `swedenCapiRate:0.04`, Équinoxe phasée, `fiscalTransferMode:'none'` (le système redevient autonome) |
| 4 | Mode Chilien                   | `v1_default` + `chileMode:true` (toggle canonique App.jsx l.366)     | `cutoffAge:50`, HLM liquidation active (`delta:0.3, rho:0.05`), Équinoxe phasée, `lambda:0`, `tauK:0`, `fiscalTransferMode:'none'` (pas de financement BG → la dette explose et révèle le coût de transition) |
| 5 | Chili + transition financée    | `v1_default` + `chileMode:true` + `fiscalTransferMode:'no-debt'`     | Identique au #4 + leviers de financement (`lambda:0.30`, `tauK:0.025`, plein-emploi target 0.759), et surtout `fiscalTransferMode:'no-debt'` qui transforme le déficit en transfert BG plutôt qu'en dette nouvelle |

## Champs du moteur utilisés pour le graphique 3-panneaux

- **Pension moyenne par retraité (€/mois, réel)** :
  `(legacyExp_t + transitionalPaygExp_t + ndcPaygPension_t + capiPayout_t) / (retireeIdx × R0) / I_factor_t × 1000 / 12`
- **Solde du système hors transferts BG** (Md€/an) :
  `netFlow_t − fiscalTransfer_t` — positif = autonome ; négatif = dépend du BG ou de la dette
- **Dette publique cumulée** (Md€) :
  `D_t` directement

## Champs ajoutés par le moteur v2.0 utilisés ici

- `fiscalTransfer_t` (`§5.9a`) — transferts CSG/FSV/État de l'année t. Calé sur
  `fiscalTransferBase × legacyFrac_t` où `legacyFrac_t = legacyRetirees_t / retireeIdx_t`.
- `fiscalGap_t` — déficit bloqué quand `fiscalTransferMode='no-debt'` (n'augmente
  pas `D_t`). C'est ce qui permet à l'étape 5 d'afficher une dette finale ≈ 0
  tout en gardant un solde hors-BG négatif (= transition financée par BG).
- `ndcPaygPension_t` (`§5.16`) — pensions Inkomstpension notionnelles du mode Suédois.
- `abmFactor_t`, `abmCut_t` — coupe d'indexation Automatic Balance Mechanism (Suède).

## Cohérence avec App.jsx

Les 3 modes canoniques (Diversification BG, Chili, Suède) sont définis dans
`src/App.jsx` lignes 336–460. Le commentaire de `src/presets.js` ligne 153 dit
explicitement : *« chileMode is a canonical toggle in the simulator UI, not a
preset. »* — donc on n'en fait pas non plus des presets ici ; on instancie
les paramOverrides directement dans `intro_ladder_rungs.jsx`.

## Notes pédagogiques

- L'étape 4 (Chili sans financement) doit révéler l'explosion de la dette de
  transition au pic (~14k Md€ en 2073 sous démographie réaliste) — c'est
  volontaire, pour motiver l'étape 5.
- L'étape 5 (Chili financé) doit retomber à une dette finale faible — preuve
  que la transition est *finançable*, pas gratuite.
- L'étape 1 montre un solde-hors-transferts qui plonge à −3 000+ Md€/an en
  fin d'horizon : c'est ce que coûterait le statu quo si l'État cessait
  d'abonder.
