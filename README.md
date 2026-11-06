# Garde-Mail

Mini-site qui aide le grand public à réagir face à un mail ou un SMS suspect. Il est statique, sans framework, et tout se passe dans le navigateur : rien de ce que l'utilisateur colle n'est envoyé ni enregistré.

Site en ligne : https://garde-mail.netlify.app

## Les trois modules

**Ce mail est-il authentique ?** (`authenticite.html`). L'utilisateur colle les en-têtes d'un mail, avec un guide pour les obtenir dans Gmail, Outlook et Apple Mail. L'outil lit les résultats SPF, DKIM et DMARC notés par la messagerie du destinataire (`Authentication-Results`). Il recalcule l'alignement entre le domaine du `From`, celui du `Return-Path` et celui de la signature DKIM, et repère les incohérences : faux nom affiché, `Reply-To` détourné, en-tête d'authentification injecté, punycode, imitation d'un organisme. Il rend un verdict (authentique, douteux, usurpé probable) avec une explication en langage simple. En option, il consulte les enregistrements SPF et DMARC du domaine par DNS-over-HTTPS.

**Ce message est-il une arnaque ?** (`arnaque.html`). L'outil analyse le texte d'un SMS ou d'un mail avec des règles locales. Il repère les liens qui imitent une marque (nom de marque dans un domaine non officiel, sous-domaine trompeur, faute volontaire, caractères d'autres alphabets, raccourcisseur, adresse IP), l'urgence ou la menace, les demandes de paiement, d'identifiants ou de code, et les scénarios connus (faux colis, Ameli, CPF, faux conseiller bancaire, impôts). Il donne un score sur 100 et explique chaque signal. Les liens sont toujours affichés désactivés (`hxxps://exemple[.]com`).

**Mes données ont-elles fuité ?** (`fuite.html`). Le navigateur calcule l'empreinte SHA-1 du mot de passe et n'envoie que ses 5 premiers caractères à l'API Pwned Passwords. C'est le k-anonymat : la comparaison se fait localement, avec un remplissage de la réponse (padding) pour qu'on ne puisse pas deviner le préfixe d'après sa taille. Pour les adresses mail, la page renvoie vers Have I Been Pwned, en rappelant la position de la CNIL sur ce type de service.

Le site comprend aussi une rubrique « J'ai cliqué : que faire ? », classée par situation, et une page Confidentialité.

## Confidentialité

Seules deux informations peuvent quitter le navigateur, et uniquement à la demande de l'utilisateur :

| Action | Donnée envoyée | Destinataire |
|---|---|---|
| Consulter le DNS (module 1) | le nom de domaine de l'expéditeur | Cloudflare, ou Google en secours |
| Vérifier un mot de passe (module 3) | les 5 premiers caractères de l'empreinte SHA-1 | api.pwnedpasswords.com |

Cette promesse n'est pas seulement déclarée : elle est imposée par la politique de sécurité du contenu (CSP) envoyée par Netlify (`netlify.toml`). La directive `connect-src` n'autorise que ces trois adresses, et le navigateur bloque toute autre requête. La directive `form-action 'none'` empêche aussi tout envoi de formulaire.

Le site n'utilise ni cookie, ni stockage local, ni mesure d'audience. Le correcteur orthographique est désactivé dans les champs, car certains correcteurs envoient le texte saisi à un serveur.

## Lancer le site en local

Les modules JavaScript (`<script type="module">`) ne se chargent pas quand on ouvre le fichier par double-clic (`file://`). Il faut un petit serveur :

```
python3 -m http.server 8000 -d public
```

Ouvrir ensuite `http://localhost:8000`. Le calcul SHA-1 (`crypto.subtle`) ne fonctionne qu'en HTTPS ou sur `localhost`.

## Tests

```
npm test
```

Les 44 tests utilisent le lanceur intégré à Node (`node --test`, Node 20 ou plus récent) et ne demandent aucune dépendance. Ils portent sur la logique pure : lecture des en-têtes, verdicts, extraction et analyse des liens, score, calcul SHA-1. Les appels réseau (DNS, Pwned Passwords) sont testés avec un faux `fetch` qui vérifie exactement ce qui serait envoyé.

Le dossier `exemples/` contient des en-têtes et des messages de test. Les domaines frauduleux utilisent les noms réservés aux tests (`example.com`, `.test`).

## Structure

```
public/                    seul dossier publié
  *.html                   une page par module + accueil, confidentialité, « j'ai cliqué », 404
  css/                     base (couleurs, typographie, mise en page) et composants
  polices/                 Atkinson Hyperlegible Next (licence SIL OFL)
  js/commun/               domaines, marques imitées, création d'éléments sûrs
  js/authenticite/         moteur.js (logique), doh.js (DNS), page.js (interface)
  js/arnaque/              regles.js (données), moteur.js (logique), page.js
  js/fuite/                pwned.js (SHA-1 et requête), page.js
exemples/                  en-têtes et messages de test
tests/                     tests unitaires (*.test.js)
netlify.toml               publication et en-têtes de sécurité
```

## Choix techniques

1. **JavaScript natif en modules ES**, sans framework ni étape de build.
2. **Logique séparée de l'interface.** Les fichiers `moteur.js` reçoivent du texte et renvoient un objet, sans toucher à la page, ce qui permet de les tester avec Node.
3. **Aucun `innerHTML`.** Le contenu collé est potentiellement malveillant : il n'est affiché que par `textContent`, et les liens ne deviennent jamais des balises `<a>`.
4. **Pas de fichier nommé `analyse.js`.** La liste de blocage EasyPrivacy, utilisée par défaut par uBlock Origin, AdGuard ou Brave, bloque tout fichier de ce nom. Le module entier ne se chargeait plus chez les utilisateurs équipés d'un bloqueur.

## Accessibilité

1. Aucune violation relevée par axe-core (WCAG 2.2 niveaux A et AA, plus les bonnes pratiques), sur toutes les pages et avec les résultats affichés, en thème clair comme en thème sombre.
2. Contraste du texte d'au moins 5,7:1 (le minimum AA est 4,5:1).
3. Navigation complète au clavier, lien d'évitement et focus toujours visible.
4. Aucun défilement horizontal à 320 px de large ni avec un zoom à 200 %.
5. Résultats annoncés aux lecteurs d'écran par une zone `aria-live`.
6. Verdicts jamais signalés par la seule couleur : chacun est aussi écrit.
7. Animation du tampon désactivée si le système demande de réduire les animations.

## Limites connues

1. **L'outil aide à décider, il ne garantit rien.** Un message sans signal peut être une arnaque, et un expéditeur authentique peut être malhonnête.
2. **Le module 1 dépend de la messagerie du destinataire.** Il ne vérifie pas lui-même les signatures : il lit le résultat que la messagerie a noté. Sans en-tête `Authentication-Results`, il ne peut pas conclure.
3. **Domaine organisationnel simplifié.** Seuls les suffixes à deux niveaux les plus courants (`gouv.fr`, `co.uk`…) sont reconnus, au lieu de la Public Suffix List complète.
4. **Liste de marques limitée** (`js/commun/marques.js`) : seuls les domaines officiels certains y figurent. Un domaine officiel absent peut faire passer un vrai message en « douteux ».
5. **Règles heuristiques.** Le module 2 repère des formulations typiques ; les arnaques évoluent, et les règles sont à mettre à jour.
6. **Applications mobiles.** Gmail, Mail (iPhone) et Outlook mobile ne permettent pas d'afficher les en-têtes : le module 1 demande un ordinateur.

## Sources

- [Cybermalveillance.gouv.fr, fiche réflexe hameçonnage](https://www.cybermalveillance.gouv.fr/medias/2026/02/260129_FicheReflexe_Hameconnage.pdf)
- [Cybermalveillance.gouv.fr, fiche pratique mots de passe](https://www.cybermalveillance.gouv.fr/medias/2023/04/260505_FichePratique_MotsDePasse.pdf)
- [Cybermalveillance.gouv.fr, faux support technique](https://www.cybermalveillance.gouv.fr/medias/2025/07/Fiche_Senior_ArnaquesSupportTechnique-3.pdf)
- [CNIL, fuite ou vol de données](https://cnil.fr/fr/conseils-fuite-vol-donnees)
- [impots.gouv.fr, attention aux arnaques](https://www.impots.gouv.fr/actualite/attention-aux-arnaques)
- [La Poste, reconnaître une tentative de fraude](https://aide.laposte.fr/contenu/comment-reconnaitre-une-tentative-de-fraude)
- [info.gouv.fr, arnaques au CPF](https://www.info.gouv.fr/actualite/les-cles-pour-reconnaitre-une-arnaque-au-compte-personnel-de-formation)
- [Les clés de la banque, faux conseiller](https://www.lesclesdelabanque.com/particulier/fraude-faux-conseiller/) et [Perceval](https://www.lesclesdelabanque.com/particulier/perceval-fraude-carte-bancaire/)
- [DGCCRF, le 33 700](https://www.economie.gouv.fr/dgccrf/sms-et-appels-indesirables-le-33-700-facilite-le-signalement-des-numeros-frauduleux)
- [Have I Been Pwned, API Pwned Passwords](https://haveibeenpwned.com/API/v3)

## Licence

Code sous licence MIT (voir `LICENSE`). Police Atkinson Hyperlegible Next sous licence SIL Open Font License 1.1 (voir `public/polices/OFL.txt`).
