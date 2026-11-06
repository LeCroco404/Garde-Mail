/**
 * Module 3 : liaison entre le formulaire et la vérification.
 * Le champ est vidé après chaque vérification ; rien n'est conservé.
 */
import { verifierMotDePasse, ContexteNonSecurise } from './pwned.js';
import { creer, vider } from '../commun/affichage.js';

const formulaire = document.getElementById('formulaire-mdp');
const champ = document.getElementById('mot-de-passe');
const boutonAfficher = document.getElementById('afficher');
const boutonVerifier = formulaire.querySelector('button[type="submit"]');
const annonce = document.getElementById('annonce');
const zoneResultat = document.getElementById('resultat');

/** Remet le champ en mode masqué. */
function masquer() {
  champ.type = 'password';
  boutonAfficher.textContent = 'Afficher';
  boutonAfficher.setAttribute('aria-pressed', 'false');
}

boutonAfficher.addEventListener('click', () => {
  const visible = champ.type === 'text';
  if (visible) {
    masquer();
  } else {
    champ.type = 'text';
    boutonAfficher.textContent = 'Masquer';
    boutonAfficher.setAttribute('aria-pressed', 'true');
  }
  champ.focus();
});

function afficherMessage(classe, texte) {
  vider(zoneResultat);
  zoneResultat.append(creer('h2', { texte: 'Résultat' }), creer('p', { classe, texte }));
  annonce.textContent = texte;
}

function afficherResultat({ prefixe, nombre }) {
  vider(zoneResultat);
  zoneResultat.append(creer('h2', { texte: 'Résultat' }));

  if (nombre > 0) {
    const fois = `${nombre.toLocaleString('fr-FR')} fois`;
    zoneResultat.append(creer('div', { classe: 'verdict verdict--eleve' }, [
      creer('span', { classe: 'verdict__icone', texte: '✕', attributs: { 'aria-hidden': 'true' } }),
      creer('div', {}, [
        creer('p', { classe: 'verdict__titre', texte: 'Mot de passe exposé' }),
        creer('p', { texte: `Ce mot de passe apparaît ${fois} dans des fuites de données connues. Les pirates l'essaient en priorité : ne l'utilisez plus, nulle part. Changez-le sans attendre sur chaque service où vous l'utilisez, en commençant par votre messagerie.` }),
      ]),
    ]));
    annonce.textContent = `Mot de passe exposé : il apparaît ${fois} dans des fuites connues.`;
  } else {
    zoneResultat.append(creer('div', { classe: 'verdict verdict--faible' }, [
      creer('span', { classe: 'verdict__icone', texte: 'i', attributs: { 'aria-hidden': 'true' } }),
      creer('div', {}, [
        creer('p', { classe: 'verdict__titre', texte: 'Absent des fuites connues' }),
        creer('p', { texte: 'Ce mot de passe n’apparaît pas dans les fuites connues de cette base. Cela ne prouve pas qu’il est solide, ni qu’il n’a jamais fuité : il doit aussi être long et unique à chaque service.' }),
      ]),
    ]));
    annonce.textContent = 'Mot de passe absent des fuites connues de cette base.';
  }

  // Transparence : ce qui a réellement été envoyé
  zoneResultat.append(creer('p', { classe: 'aide' }, [
    'Seul ceci a été transmis au service : ',
    creer('code', { texte: prefixe }),
    ' (les 5 premiers caractères de l’empreinte). Le champ a été vidé.',
  ]));
}

formulaire.addEventListener('submit', async (evenement) => {
  evenement.preventDefault(); // le formulaire n'est jamais envoyé
  const motDePasse = champ.value; // pas de trim : les espaces font partie du mot de passe
  if (motDePasse === '') {
    afficherMessage('alerte', 'Saisissez d’abord un mot de passe.');
    champ.focus();
    return;
  }

  boutonVerifier.disabled = true;
  afficherMessage('aide', 'Vérification en cours…');
  try {
    afficherResultat(await verifierMotDePasse(motDePasse));
  } catch (erreur) {
    if (erreur instanceof ContexteNonSecurise) {
      afficherMessage('alerte', 'La vérification n’est possible que sur une page sécurisée (adresse en https). Votre mot de passe n’a pas été envoyé.');
    } else {
      afficherMessage('alerte', 'Le service de vérification n’a pas répondu. Réessayez plus tard. Votre mot de passe n’a pas été envoyé.');
    }
  } finally {
    champ.value = ''; // rien n'est conservé
    masquer();
    boutonVerifier.disabled = false;
  }
});

// Le script est chargé : on active le bouton et on retire le message de chargement.
boutonVerifier.disabled = false;
document.getElementById('chargement').hidden = true;
