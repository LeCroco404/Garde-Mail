/**
 * Module 2 : données des règles (pas de logique ici).
 * Les motifs s'appliquent à un texte en minuscules et SANS accents
 * (« Réglez immédiatement » devient « reglez immediatement »).
 */

/* Seuils du niveau de risque (score sur 100) */
export const SEUILS = { suspect: 25, eleve: 55 };

/* Score minimal si un lien imite une marque ET que le message demande paiement, données ou code */
export const PLANCHER_COMBINAISON = 70;

/* Points ajoutés une seule fois si un scénario connu est reconnu ET que le message contient un lien */
export const POINTS_SCENARIO = 10;

/* ------------------------------------------------------------------ */
/* Liens                                                               */
/* ------------------------------------------------------------------ */

export const SIGNAUX_LIENS = {
  L1: { points: 35 },
  L2: { points: 40 },
  L3: { points: 40 },
  L4: { points: 30 },
  L5: { points: 15 },
  L6: { points: 30 },
};

/* Services de liens raccourcis (domaines organisationnels) */
export const RACCOURCISSEURS = new Set([
  'bit.ly', 'tinyurl.com', 'cutt.ly', 'is.gd', 'ow.ly', 't.ly', 'rb.gy', 'shorturl.at',
  'tiny.cc', 'rebrand.ly', 'bl.ink', 's.id', 'buff.ly', 'urlz.fr', 'goo.gl', 't.co',
]);

/*
 * Extensions acceptées pour un domaine écrit SANS « http » ni « www » et SANS chemin
 * (« rendez-vous sur exemple.fr »). Ce n'est pas une liste d'extensions suspectes :
 * elle évite seulement de prendre « M.Dupont » ou « 24h.Merci » pour un lien.
 */
export const EXTENSIONS_NUES = new Set([
  'fr', 'com', 'net', 'org', 'info', 'eu', 'io', 'co', 'me', 'app', 'xyz', 'top', 'online',
  'site', 'shop', 'live', 'link', 'click', 'help', 'support', 'be', 'ch',
]);

/* Équivalences de caractères utilisées pour imiter une marque (paypa1 → paypal) */
export const HOMOGLYPHES = [
  ['0', 'o'], ['1', 'l'], ['3', 'e'], ['4', 'a'], ['5', 's'], ['7', 't'], ['rn', 'm'], ['vv', 'w'],
];

/* Étiquettes de marque trop génériques pour la détection de fautes volontaires */
export const REFERENCES_EXCLUES = new Set(['finances', 'pole-emploi']);

/* ------------------------------------------------------------------ */
/* Texte                                                               */
/* ------------------------------------------------------------------ */

export const SIGNAUX_TEXTE = [
  {
    code: 'T1',
    points: 15,
    texte: 'Le message vous presse ou vous menace, pour vous empêcher de réfléchir.',
    motifs: [
      /\bsous\s+(?:24|48|72)\s*h(?:eures?)?\b/g,
      /\bdernier(?:e)?\s+(?:rappel|avis|relance|chance)\b/g,
      /\bimmediatement\b/g,
      /\burgent(?:e)?\b/g,
      /\bsuspendu(?:e)?s?\b/g,
      /\bbloque(?:e)?s?\b/g,
      /\bhuissier\b/g,
      /\bpoursuites?\b/g,
      /\bsaisie\b/g,
      /\bamende\s+majoree\b/g,
      /\bsera\s+(?:supprime|desactive|cloture|retourne|detruit)e?\b/g,
      /\bexpir(?:e|ent|era|eront)\b/g,
    ],
  },
  {
    code: 'T2',
    points: 20,
    texte: 'Le message vous demande de payer, souvent une petite somme pour récupérer vos coordonnées bancaires.',
    motifs: [
      /\bfrais\s+(?:de\s+)?(?:livraison|reexpedition|douane|port|traitement|reprogrammation|dedouanement)\b/g,
      /\bdroits?\s+de\s+douane\b/g,
      /\b(?:regler|reglez|payer|payez|paiement|reglement)\b/g,
      /(?:^|[^\d])\d{1,2}[,.]\d{2}\s?(?:€|eur\b|euros?\b)/g,
    ],
  },
  {
    code: 'T3',
    points: 25,
    texte: 'Le message demande des informations qu’un organisme sérieux ne demande pas par message.',
    motifs: [
      /\bmot\s+de\s+passe\b/g,
      /\bidentifiants?\b/g,
      /\bnumero\s+de\s+(?:carte|compte)\b/g,
      /\bcryptogramme\b/g,
      /\bcvv\b/g,
      /\bcoordonnees\s+bancaires\b/g,
      /\brib\b/g,
      /\bdate\s+d.?expiration\b/g,
      /\bmett?(?:re|ez)\s+a\s+jour\s+(?:vos|votre)\s+(?:informations|donnees|coordonnees|profil)\b/g,
      /\bconfirm(?:er|ez)\s+(?:vos|votre)\s+(?:identite|informations|donnees|coordonnees)\b/g,
    ],
  },
  {
    code: 'T4',
    points: 40,
    texte: 'Un vrai conseiller ne demande jamais un code reçu par SMS, ni de valider une opération que vous n’avez pas faite.',
    motifs: [
      /\bcode\s+(?:recu|de\s+validation|de\s+confirmation|de\s+securite|sms|a\s+usage\s+unique)\b/g,
      /\ble\s+code\s+(?:que\s+vous\s+(?:allez\s+)?rec(?:evez|evrez|evoir)|qui\s+vous\s+(?:a\s+ete|sera)\s+envoye)\b/g,
      /\bvalid(?:er|ez)\s+(?:l.?operation|le\s+virement|la\s+transaction|le\s+paiement)\b/g,
      /\bajout\s+(?:d.?un\s+)?beneficiaire\b/g,
      /\bcompte\s+de\s+securite\b/g,
      /\b(?:anydesk|teamviewer)\b/g,
    ],
  },
  {
    code: 'T5',
    points: 15,
    texte: 'Une bonne nouvelle inattendue est un appât classique.',
    motifs: [
      /\bremboursement\b/g,
      /\bvous\s+avez\s+droit\b/g,
      /\bgagne(?:e|z)?\b/g,
      /\bcadeau\b/g,
      /\bgratuit(?:e)?s?\b/g,
      /\b(?:prime|aide)\s+exceptionnelle\b/g,
    ],
  },
  {
    code: 'T6',
    points: 20,
    texte: 'Les numéros en 0 899 ou 0 891 sont utilisés par des fraudeurs qui se font passer pour l’administration.',
    motifs: [/\b0\s?8\s?9\s?[19](?:[\s.-]?\d){6}\b/g],
  },
];

/* ------------------------------------------------------------------ */
/* Scénarios connus et conseils officiels                              */
/* ------------------------------------------------------------------ */

export const SCENARIOS = [
  {
    id: 'colis',
    nom: 'Faux colis',
    motif: /\b(?:colis|livraison|livreur|adresse\s+(?:incomplete|incorrecte)|en\s+attente\s+de\s+livraison)\b/,
    conseil: 'Vérifiez l’envoi avec l’outil de suivi du site officiel de La Poste (laposte.fr), en tapant l’adresse vous-même. Signalez le message à phishing@laposte.fr ou, pour un SMS, au 33700.',
    source: { titre: 'La Poste : reconnaître une tentative de fraude', url: 'https://aide.laposte.fr/contenu/comment-reconnaitre-une-tentative-de-fraude' },
  },
  {
    id: 'ameli',
    nom: 'Assurance Maladie',
    motif: /\b(?:carte\s+vitale|ameli|assurance\s+maladie|cpam)\b/,
    conseil: 'Faites vos démarches dans votre compte ameli, en tapant ameli.fr vous-même, jamais depuis un lien reçu par message.',
    source: { titre: 'Forum des assurés ameli', url: 'https://forum-assures.ameli.fr/questions/2888833-arnaque-mise-jour-carte-vitale' },
  },
  {
    id: 'cpf',
    nom: 'Compte personnel de formation',
    motif: /\b(?:cpf|compte\s+(?:personnel\s+de\s+)?formation)\b/,
    conseil: 'Connectez-vous uniquement sur moncompteformation.gouv.fr. Ne communiquez jamais vos données personnelles et signalez les SMS au 33700.',
    source: { titre: 'info.gouv.fr : reconnaître une arnaque au CPF', url: 'https://www.info.gouv.fr/actualite/les-cles-pour-reconnaitre-une-arnaque-au-compte-personnel-de-formation' },
  },
  {
    id: 'banque',
    nom: 'Faux conseiller bancaire',
    motif: /\b(?:conseill(?:er|ere)\s+(?:bancaire|clientele)|operation\s+suspecte|activite\s+suspecte|service\s+(?:des\s+)?fraudes?|compte\s+de\s+securite|votre\s+banque)\b/,
    conseil: 'Un conseiller ne vous demandera jamais vos codes, ni de faire un virement urgent. Raccrochez et rappelez votre banque au numéro habituel. Ne validez jamais une opération que vous n’avez pas faite.',
    source: { titre: 'Les clés de la banque : fraude au faux conseiller', url: 'https://www.lesclesdelabanque.com/particulier/fraude-faux-conseiller/' },
  },
  {
    id: 'impots',
    nom: 'Impôts',
    motif: /\b(?:impots?|dgfip|finances\s+publiques|tresor\s+public|amende\s+impayee)\b/,
    conseil: 'La DGFiP n’envoie jamais de SMS pour défaut de paiement et ne demande jamais de numéro de carte pour un remboursement. Ses courriels viennent de @dgfip.finances.gouv.fr. En cas de doute, passez par votre espace sur impots.gouv.fr.',
    source: { titre: 'impots.gouv.fr : attention aux arnaques', url: 'https://www.impots.gouv.fr/actualite/attention-aux-arnaques' },
  },
];
