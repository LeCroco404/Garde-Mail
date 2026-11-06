/**
 * Module 1 : liaison entre le formulaire, l'analyse et l'affichage.
 * Rappel de sécurité : tout ce qui vient des en-têtes est affiché via textContent
 * (fonction creer), jamais via innerHTML.
 */
import { analyserEnTetes, TAILLE_MAX } from './moteur.js';
import { consulterDomaine } from './doh.js';
import { creer, vider } from '../commun/affichage.js';

const formulaire = document.getElementById('formulaire-entetes');
const champ = document.getElementById('entetes');
const boutonEffacer = document.getElementById('effacer');
const annonce = document.getElementById('annonce'); // zone aria-live, lue par les lecteurs d'écran
const zoneResultat = document.getElementById('resultat');

/* ------------------------------------------------------------------ */
/* Textes                                                              */
/* ------------------------------------------------------------------ */

const VERDICTS = {
  authentique: {
    titre: 'Authentique',
    texte: (d) => `Ce message vient bien du domaine affiché : ${d}. Votre messagerie a vérifié qu'il a été envoyé par un serveur autorisé par ce domaine. Attention : cela prouve qui l'a envoyé, pas qu'il est honnête. Un escroc peut créer son propre domaine (comme banque-securite-client.fr) et l'authentifier parfaitement. Vérifiez que ce domaine est bien celui de l'organisme, et analysez le texte avec le module « Ce message est-il une arnaque ? ».`,
  },
  douteux: {
    titre: 'Douteux',
    texte: (d) => `Impossible de confirmer que ce message vient bien de ${d}. Ce n'est pas forcément une fraude : certains envois légitimes (newsletters, transferts automatiques) donnent ce résultat. Ne cliquez sur aucun lien et ne répondez pas avant d'avoir contacté l'organisme par un autre moyen : son site officiel, que vous tapez vous-même, ou son numéro habituel.`,
  },
  usurpe: {
    titre: 'Usurpé probable',
    texte: (d) => `Ce message prétend venir de ${d}, mais votre messagerie indique qu'il n'a pas été envoyé par ce domaine. C'est le signe typique d'une usurpation. Ne cliquez sur aucun lien, n'ouvrez pas les pièces jointes et ne répondez pas. Signalez-le sur signal-spam.fr, puis supprimez-le.`,
  },
};

const NIVEAUX = { info: 'Information', attention: 'Attention' };

/** Phrase simple pour un résultat SPF. */
function phraseSpf(spf) {
  if (!spf) return 'Résultat absent des en-têtes.';
  const d = spf.domaine || 'le domaine d’envoi';
  const base = {
    pass: `Réussi. Le serveur d'envoi est autorisé par ${d}.`,
    fail: `Échoué. Le serveur d'envoi n'est pas autorisé par ${d}.`,
    softfail: `Échec souple. ${d} juge ce serveur suspect, sans le rejeter.`,
    neutral: `Non concluant. ${d} ne se prononce pas.`,
    none: `Non concluant. ${d} ne publie pas de règle SPF.`,
  }[spf.resultat] ?? 'Erreur technique lors de la vérification : aucune conclusion possible.';
  if (spf.resultat !== 'pass') return base;
  return `${base} ${spf.aligne ? 'Ce domaine correspond à l’expéditeur affiché.' : 'Ce domaine est différent de l’expéditeur affiché.'}`;
}

/** Phrase simple pour une signature DKIM. */
function phraseDkim(d) {
  const domaine = d.domaine || 'un domaine inconnu';
  const base = {
    pass: `Réussi. Le message est signé par ${domaine} et n'a pas été modifié.`,
    fail: `Échoué. La signature de ${domaine} n'est pas valide : le message a pu être modifié.`,
    none: 'Le message n’est pas signé.',
  }[d.resultat] ?? 'Non concluant (erreur ou signature inutilisable).';
  if (d.resultat !== 'pass') return base;
  return `${base} ${d.aligne ? 'Ce domaine correspond à l’expéditeur affiché.' : 'Ce domaine est différent de l’expéditeur affiché.'}`;
}

/** Phrase simple pour DMARC. */
function phraseDmarc(dmarc, domaine) {
  if (!dmarc) return 'Résultat absent des en-têtes.';
  const politique = dmarc.politique ? ` Politique publiée : ${dmarc.politique}.` : '';
  const base = {
    pass: `Réussi. Le domaine affiché (${domaine}) a bien autorisé ce message.`,
    bestguesspass: `${domaine} ne publie pas de règle DMARC, mais les vérifications auraient réussi.`,
    fail: `Échoué. Ni SPF ni DKIM ne confirment le domaine affiché (${domaine}).`,
    none: `${domaine} ne publie pas de règle DMARC.`,
  }[dmarc.resultat] ?? 'Erreur technique lors de la vérification : aucune conclusion possible.';
  return base + politique;
}

/* ------------------------------------------------------------------ */
/* Affichage                                                           */
/* ------------------------------------------------------------------ */

function ligneVerification(titre, phrase) {
  return creer('li', {}, [creer('strong', { texte: `${titre} : ` }), phrase]);
}

function afficherResultat(r) {
  vider(zoneResultat);
  zoneResultat.append(creer('h2', { texte: 'Résultat de l’analyse' }));

  if (r.statut === 'impossible') {
    zoneResultat.append(creer('p', { classe: 'alerte', texte: 'Je ne trouve pas d’expéditeur dans ce texte. Collez les en-têtes complets du message en suivant le guide ci-dessous.' }));
    annonce.textContent = 'Analyse impossible : aucun expéditeur trouvé.';
    return;
  }

  const v = VERDICTS[r.statut];
  // Le verdict est un tampon : un mot écrit, pas seulement une couleur.
  zoneResultat.append(
    creer('div', { classe: `verdict verdict--${r.statut}` }, [
      creer('p', { classe: 'tampon', texte: v.titre }),
      creer('div', {}, [
        creer('p', { texte: v.texte(r.expediteur.domaine) }),
        creer('p', { classe: 'verdict__raison' }, [creer('strong', { texte: 'Pourquoi : ' }), r.raison]),
      ]),
    ]),
  );

  // Expéditeur
  zoneResultat.append(
    creer('h3', { texte: 'Expéditeur affiché' }),
    creer('p', {}, [
      r.expediteur.nom ? `${r.expediteur.nom} ` : '',
      creer('code', { texte: r.expediteur.adresse }),
    ]),
  );

  // Détail des vérifications
  const liste = creer('ul', { classe: 'liste-verifs' }, [
    ligneVerification('SPF', phraseSpf(r.spf)),
    ...(r.dkim.length > 0
      ? r.dkim.map((d, i) => ligneVerification(r.dkim.length > 1 ? `DKIM (${i + 1})` : 'DKIM', phraseDkim(d)))
      : [ligneVerification('DKIM', 'Résultat absent des en-têtes.')]),
    ligneVerification('DMARC', phraseDmarc(r.dmarc, r.expediteur.domaine)),
    r.compauth ? ligneVerification('Évaluation Microsoft (compauth)', r.compauth) : null,
  ]);
  zoneResultat.append(creer('h3', { texte: 'Détail des vérifications' }), liste);
  if (r.serveur) {
    zoneResultat.append(creer('p', { classe: 'aide', texte: `Vérifications faites par : ${r.serveur}` }));
  }

  // Points relevés
  if (r.signaux.length > 0) {
    zoneResultat.append(
      creer('h3', { texte: 'Points relevés' }),
      creer('ul', { classe: 'liste-signaux' }, r.signaux.map((s) =>
        creer('li', { classe: 'signal' }, [
          creer('span', { classe: `badge badge--${s.niveau}`, texte: NIVEAUX[s.niveau] }),
          creer('span', { texte: s.texte }),
        ]))),
    );
  }

  // Consultation DNS optionnelle
  zoneResultat.append(blocDns(r.expediteur.domaine, r.expediteur.organisation));

  zoneResultat.append(creer('p', { classe: 'rappel', texte: 'Cet outil aide à décider mais ne garantit rien.' }));
  annonce.textContent = `Résultat : ${v.titre}. ${r.raison}`;
}

/** Bloc « Consulter le DNS du domaine » : rien ne part tant que l'utilisateur n'a pas cliqué. */
function blocDns(domaine, organisation) {
  const sortie = creer('div', { attributs: { 'aria-live': 'polite' } });
  const bouton = creer('button', { classe: 'bouton bouton--secondaire', texte: `Consulter le DNS de ${domaine}`, attributs: { type: 'button' } });

  bouton.addEventListener('click', async () => {
    bouton.disabled = true;
    vider(sortie);
    sortie.append(creer('p', { texte: 'Consultation en cours…' }));
    try {
      const dns = await consulterDomaine(domaine, organisation);
      vider(sortie);
      sortie.append(
        enregistrementDns(`SPF de ${dns.spf.domaine}`, dns.spf),
        enregistrementDns(`DMARC de ${dns.dmarc.domaine}`, dns.dmarc),
        creer('p', { classe: 'aide', texte: `Réponse fournie par : ${dns.fournisseurs.join(', ')}. Ces informations décrivent la protection du domaine, pas ce message en particulier : elles ne changent pas le verdict.` }),
      );
    } catch {
      vider(sortie);
      sortie.append(creer('p', { classe: 'alerte', texte: 'Le service DNS n’a pas répondu. Réessayez plus tard.' }));
    } finally {
      bouton.disabled = false;
    }
  });

  return creer('section', { classe: 'bloc-dns', attributs: { 'aria-label': 'Consultation DNS' } }, [
    creer('h3', { texte: 'Protection du domaine (facultatif)' }),
    creer('p', { classe: 'aide', texte: 'Seul le nom de domaine est envoyé à Cloudflare (ou à Google en secours), jamais le contenu du message.' }),
    bouton,
    sortie,
  ]);
}

function enregistrementDns(titre, info) {
  return creer('div', { classe: 'enregistrement' }, [
    creer('p', {}, [
      creer('span', { classe: `badge badge--${info.niveau}`, texte: NIVEAUX[info.niveau] }),
      ' ',
      creer('strong', { texte: `${titre} : ` }),
      info.texte,
    ]),
    info.brut ? creer('pre', { classe: 'brut', texte: info.brut }) : null,
  ]);
}

/* ------------------------------------------------------------------ */
/* Événements                                                          */
/* ------------------------------------------------------------------ */

formulaire.addEventListener('submit', (evenement) => {
  evenement.preventDefault(); // rien n'est envoyé : tout se passe ici
  const texte = champ.value;
  if (texte.trim() === '') {
    vider(zoneResultat);
    zoneResultat.append(creer('p', { classe: 'alerte', texte: 'Collez d’abord les en-têtes du message.' }));
    annonce.textContent = 'Le champ est vide.';
    champ.focus();
    return;
  }
  if (texte.length > TAILLE_MAX) {
    vider(zoneResultat);
    zoneResultat.append(creer('p', { classe: 'alerte', texte: 'Le texte est trop long (plus de 200 000 caractères). Collez uniquement les en-têtes.' }));
    annonce.textContent = 'Texte trop long.';
    return;
  }
  afficherResultat(analyserEnTetes(texte));
});

boutonEffacer.addEventListener('click', () => {
  champ.value = '';
  vider(zoneResultat);
  annonce.textContent = 'Champ et résultat effacés.';
  champ.focus();
});

// Le script est chargé : on active le bouton et on retire le message de chargement.
formulaire.querySelector('button[type="submit"]').disabled = false;
document.getElementById('chargement').hidden = true;
