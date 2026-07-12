# Contribuer à CapiModel

CapiModel est un modèle **neutre** de la transition des retraites par
répartition vers la capitalisation : un outil de simulation, pas un plaidoyer.
Les corrections factuelles, sources, et hypothèses discutées sont bienvenues.

## Signaler une erreur

- **Erreur de modèle / donnée** : ouvrez un ticket avec le gabarit
  [« Erreur de modèle »](.github/ISSUE_TEMPLATE/model-error.yaml). Pour une
  constante, joignez la source officielle (titre, date, URL).
- **Retour rapide** : le formulaire de retour intégré au site (widget en bas de
  page). Voir la note de confidentialité ci-dessous et sur la page « Hypothèses ».

## Où vivent les hypothèses

- `THEORY.md` — la théorie de fonctionnement, la feuille de route, et le statut
  épistémique des hypothèses de rendement/taux.
- `src/calibration.js` — le **registre des constantes sourcées** (valeur, clé
  moteur, source documentée). Un test (`tests/calibration.test.js`) vérifie
  l'accord avec `DEFAULT_CONFIG`. Toute modification d'une constante moteur doit
  mettre à jour son entrée ici dans le même commit.
- `cdc_legacy_fund_model.md` — la spec d'origine (partiellement dépassée ; le
  moteur fait foi via les commentaires `// eq (N)`).

## Développement

```bash
npm ci
npm test        # vitest — la suite doit rester verte
npm run build
```

- Le `src/` racine est la build canonique (il n'y a plus de duplicata `app/`).
- Toute modification du moteur qui change une sortie par défaut doit régénérer
  les fixtures (`node scripts/regen-fixtures.mjs`) avec une justification.

## Confidentialité du formulaire de retour

Le widget enregistre le message et, si fournis, un nom et un e-mail, dans une
base Supabase gérée par le projet, à seule fin de répondre et de suivre les
corrections. La clé publique (anon) ne permet que l'**insertion** dans la table
`feedback` (aucune lecture publique) — posture documentée et à vérifier dans
`supabase/README.md`. Aucune donnée n'est requise pour utiliser le simulateur ;
demande de suppression possible via un ticket.
