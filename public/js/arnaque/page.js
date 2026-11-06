/**
 * Module 2 : liaison entre le formulaire, l'analyse et l'affichage.
 * Les liens ne sont JAMAIS rendus cliquables : ils sont affichés défangés, en texte.
 */
import { analyserMessage, TAILLE_MAX } from './moteur.js';
import { creer, vider } from '../commun/affichage.js';

const formulaire = document.getElementById('formulaire-message');
const champ = document.getElementById('message');
const boutonEffacer = document.getElementById('effacer');
const annonce = document.getElementById('annonce');
const zoneResultat = document.getElementById('resultat');

const NIVEAUX = {
  faible: {
    titre: 'Peu de signaux',
    icone: 'i',
    texte: 'Aucun signal fort n’a été trouvé. Cela ne prouve pas que le message est honnête : en cas de doute, contactez l’organisme par ses coordonnées habituelles.',
  },
  suspect: {
    titre: 'Suspect',
    icone: '!',
    texte: 'Plusieurs éléments ressemblent à une arnaque. Ne cliquez pas et ne répondez pas avant d’avoir vérifié auprès de l’organisme, par un autre moyen.',
  },
  eleve: {
    titre: 'Très suspect',
    icone: '✕',
    texte: 'Ce message présente les signes typiques d’une arnaque. Ne cliquez sur aucun lien, ne payez rien, ne donnez aucun code. Signalez-le (signal-spam.fr pour un mail, 33700 pour un SMS), puis supprimez-le.',
  },
};

function afficherResultat(r) {
  vider(zoneResultat);
  const n = NIVEAUX[r.niveau];
  zoneResultat.append(creer('h2', { texte: 'Résultat de l’analyse' }));

  // Niveau : texte + icône + jauge, jamais la couleur seule
  const jauge = creer('meter', {
    attributs: { id: 'jauge', min: '0', max: '100', low: '25', high: '55', optimum: '0', value: String(r.score) },
  });
  zoneResultat.append(
    creer('div', { classe: `verdict verdict--${r.niveau}` }, [
      creer('span', { classe: 'verdict__icone', texte: n.icone, attributs: { 'aria-hidden': 'true' } }),
      creer('div', {}, [
        creer('p', { classe: 'verdict__titre', texte: n.titre }),
        creer('p', { classe: 'score' }, [
          creer('label', { texte: `Score de risque : ${r.score} / 100`, attributs: { for: 'jauge' } }),
          jauge,
        ]),
        creer('p', { texte: n.texte }),
      ]),
    ]),
  );

  // Liens trouvés
  zoneResultat.append(creer('h3', { texte: `Liens trouvés (${r.liens.length})` }));
  if (r.liens.length === 0) {
    zoneResultat.append(creer('p', { texte: 'Aucun lien trouvé dans le message.' }));
  } else {
    zoneResultat.append(
      creer('p', { classe: 'aide', texte: 'Les liens sont affichés désactivés (hxxp, [.]) pour qu’on ne puisse pas les ouvrir par erreur.' }),
      creer('ul', { classe: 'liste-signaux' }, r.liens.map((l) => {
        let badge;
        let explication;
        if (l.signal) {
          badge = creer('span', { classe: 'badge badge--attention', texte: `+${l.signal.points}` });
          explication = l.signal.texte;
        } else if (l.officiel) {
          badge = creer('span', { classe: 'badge badge--info', texte: 'Officiel' });
          explication = `Domaine officiel de ${l.officiel}. L’adresse est la bonne, mais cela ne prouve pas que le message est honnête.`;
        } else {
          badge = creer('span', { classe: 'badge badge--info', texte: '0' });
          explication = 'Aucun signal particulier sur ce lien.';
        }
        return creer('li', { classe: 'signal' }, [badge, creer('span', {}, [creer('code', { texte: l.affiche }), ` ${explication}`])]);
      })),
    );
  }

  // Signaux du texte
  zoneResultat.append(creer('h3', { texte: 'Signaux dans le texte' }));
  if (r.signaux.length === 0) {
    zoneResultat.append(creer('p', { texte: 'Aucun signal trouvé dans le texte.' }));
  } else {
    zoneResultat.append(creer('ul', { classe: 'liste-signaux' }, r.signaux.map((s) =>
      creer('li', { classe: 'signal' }, [
        creer('span', { classe: 'badge badge--attention', texte: `+${s.points}` }),
        creer('span', {}, [
          s.texte,
          creer('span', { classe: 'preuves', texte: ` Trouvé : ${s.preuves.map((p) => `« ${p} »`).join(', ')}.` }), // espaces insécables : « » jamais isolés
        ]),
      ]))));
  }

  if (r.plancher) {
    zoneResultat.append(creer('p', { classe: 'aide', texte: 'Score relevé à 70 : un lien imite un organisme et le message demande un paiement, des données ou un code.' }));
  }

  // Conseils officiels pour les scénarios reconnus
  if (r.scenarios.length > 0) {
    zoneResultat.append(creer('h3', { texte: 'Conseils pour ce type de message' }));
    for (const s of r.scenarios) {
      zoneResultat.append(creer('div', { classe: 'enregistrement' }, [
        creer('p', {}, [creer('strong', { texte: `${s.nom} : ` }), s.conseil]),
        creer('p', { classe: 'aide' }, [
          'Source : ',
          creer('a', { texte: s.source.titre, attributs: { href: s.source.url, rel: 'noopener noreferrer' } }),
        ]),
      ]));
    }
  }

  zoneResultat.append(creer('p', { classe: 'rappel', texte: 'Cet outil aide à décider mais ne garantit rien.' }));
  annonce.textContent = `Résultat : ${n.titre}, score ${r.score} sur 100. ${r.liens.length} lien(s), ${r.signaux.length} signal(aux) dans le texte.`;
}

formulaire.addEventListener('submit', (evenement) => {
  evenement.preventDefault(); // rien n'est envoyé : tout se passe dans le navigateur
  const texte = champ.value;
  if (texte.trim() === '') {
    vider(zoneResultat);
    zoneResultat.append(creer('p', { classe: 'alerte', texte: 'Collez d’abord le texte du message.' }));
    annonce.textContent = 'Le champ est vide.';
    champ.focus();
    return;
  }
  if (texte.length > TAILLE_MAX) {
    vider(zoneResultat);
    zoneResultat.append(creer('p', { classe: 'alerte', texte: 'Le texte est trop long (plus de 50 000 caractères). Collez uniquement le message.' }));
    annonce.textContent = 'Texte trop long.';
    return;
  }
  afficherResultat(analyserMessage(texte));
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
