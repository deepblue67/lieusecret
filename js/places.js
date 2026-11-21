// Les lieux du jeu, rangés en paquets. Chaque lieu a un emoji et des rôles
// (utilisés seulement si l'option « Rôles » est activée dans les réglages).
// Pour ajouter un lieu : une ligne dans le paquet de son choix, avec un id unique.

export const PACKS = [
  { id: 'quotidien', name: 'Au quotidien', icon: '🏠' },
  { id: 'vacances', name: 'Vacances', icon: '🏖️' },
  { id: 'sorties', name: 'Sorties', icon: '🎟️' },
  { id: 'fantaisie', name: 'Fantaisie', icon: '🏰' },
];

export const DEFAULT_PACKS = ['quotidien', 'vacances', 'fantaisie'];

export const PLACES = [
  // 🏠 Au quotidien
  { id: 'ecole', pack: 'quotidien', emoji: '🏫', name: "L'école", roles: ['Maîtresse', 'Élève', 'Directeur', 'Cantinière', 'Gardien', 'Parent d’élève', 'Infirmière scolaire'] },
  { id: 'supermarche', pack: 'quotidien', emoji: '🛒', name: 'Le supermarché', roles: ['Caissière', 'Client pressé', 'Boucher', 'Vigile', 'Enfant qui réclame des bonbons', 'Livreur', 'Chef de rayon'] },
  { id: 'hopital', pack: 'quotidien', emoji: '🏥', name: "L'hôpital", roles: ['Médecin', 'Infirmier', 'Patient', 'Chirurgien', 'Visiteur', 'Ambulancier', 'Bébé qui vient de naître'] },
  { id: 'boulangerie', pack: 'quotidien', emoji: '🥖', name: 'La boulangerie', roles: ['Boulanger', 'Pâtissière', 'Vendeuse', 'Client gourmand', 'Apprenti', 'Livreur de farine', 'Enfant qui achète des bonbons'] },
  { id: 'bibliotheque', pack: 'quotidien', emoji: '📚', name: 'La bibliothèque', roles: ['Bibliothécaire', 'Lecteur', 'Étudiant qui révise', 'Conteuse', 'Enfant', 'Auteur en dédicace', 'Agent d’entretien'] },
  { id: 'gare', pack: 'quotidien', emoji: '🚉', name: 'La gare', roles: ['Contrôleur', 'Conducteur de train', 'Voyageur en retard', 'Guichetier', 'Vendeur de journaux', 'Touriste perdu', 'Porteur de bagages'] },
  { id: 'restaurant', pack: 'quotidien', emoji: '🍝', name: 'Le restaurant', roles: ['Chef cuisinier', 'Serveur', 'Client', 'Plongeur', 'Critique gastronomique', 'Musicien', 'Maître d’hôtel'] },
  { id: 'coiffeur', pack: 'quotidien', emoji: '💇', name: 'Le salon de coiffure', roles: ['Coiffeuse', 'Client', 'Apprentie', 'Barbier', 'Enfant qui a peur des ciseaux', 'Coloriste', 'Patronne'] },
  { id: 'dentiste', pack: 'quotidien', emoji: '🦷', name: 'Le cabinet du dentiste', roles: ['Dentiste', 'Assistante', 'Patient', 'Secrétaire', 'Enfant courageux', 'Parent', 'Prothésiste'] },
  { id: 'pompiers', pack: 'quotidien', emoji: '🚒', name: 'La caserne de pompiers', roles: ['Capitaine', 'Pompier', 'Chauffeur du camion', 'Jeune recrue', 'Standardiste', 'Mécanicien', 'Chien de sauvetage'] },
  { id: 'ferme', pack: 'quotidien', emoji: '🐄', name: 'La ferme', roles: ['Fermier', 'Fermière', 'Vétérinaire', 'Vache', 'Tracteur', 'Épouvantail', 'Enfant en visite'] },

  // 🏖️ Vacances
  { id: 'plage', pack: 'vacances', emoji: '🏖️', name: 'La plage', roles: ['Maître-nageur', 'Surfeur', 'Vendeur de glaces', 'Enfant qui fait un château de sable', 'Touriste qui bronze', 'Pêcheur', 'Mouette'] },
  { id: 'camping', pack: 'vacances', emoji: '🏕️', name: 'Le camping', roles: ['Campeur', 'Gérant du camping', 'Animateur', 'Voisin de tente', 'Enfant', 'Moustique', 'Vendeur de pain'] },
  { id: 'piscine', pack: 'vacances', emoji: '🏊', name: 'La piscine', roles: ['Maître-nageur', 'Nageur', 'Enfant avec des brassards', 'Plongeur', 'Prof d’aquagym', 'Caissière', 'Parent sur le transat'] },
  { id: 'ski', pack: 'vacances', emoji: '⛷️', name: 'La station de ski', roles: ['Moniteur de ski', 'Skieur', 'Snowboardeur', 'Pisteur secouriste', 'Loueur de skis', 'Enfant de l’école de ski', 'Cuisinier de la cabane'] },
  { id: 'avion', pack: 'vacances', emoji: '✈️', name: "L'avion", roles: ['Pilote', 'Hôtesse de l’air', 'Steward', 'Passager', 'Bébé qui pleure', 'Copilote', 'Touriste qui a peur'] },
  { id: 'hotel', pack: 'vacances', emoji: '🏨', name: "L'hôtel", roles: ['Réceptionniste', 'Groom', 'Femme de chambre', 'Client', 'Directeur', 'Cuisinier', 'Voiturier'] },
  { id: 'croisiere', pack: 'vacances', emoji: '🛳️', name: 'Le bateau de croisière', roles: ['Capitaine', 'Matelot', 'Passager', 'Animateur', 'Cuisinier', 'Musicien', 'Médecin du bord'] },
  { id: 'parc', pack: 'vacances', emoji: '🎢', name: "Le parc d'attractions", roles: ['Visiteur', 'Mascotte', 'Vendeur de barbe à papa', 'Conducteur de manège', 'Enfant trop petit', 'Agent de sécurité', 'Photographe'] },
  { id: 'zoo', pack: 'vacances', emoji: '🦁', name: 'Le zoo', roles: ['Soigneur', 'Vétérinaire', 'Visiteur', 'Guide', 'Lion', 'Singe', 'Vendeur de souvenirs'] },
  { id: 'aquarium', pack: 'vacances', emoji: '🐠', name: "L'aquarium", roles: ['Plongeur soigneur', 'Guide', 'Visiteur', 'Biologiste', 'Requin', 'Poisson-clown', 'Enfant collé à la vitre'] },

  // 🎟️ Sorties
  { id: 'cinema', pack: 'sorties', emoji: '🎬', name: 'Le cinéma', roles: ['Spectateur', 'Ouvreuse', 'Vendeur de pop-corn', 'Projectionniste', 'Acteur en avant-première', 'Caissier', 'Spectateur qui parle trop'] },
  { id: 'musee', pack: 'sorties', emoji: '🖼️', name: 'Le musée', roles: ['Guide', 'Gardien', 'Visiteur', 'Peintre', 'Classe en sortie', 'Restaurateur de tableaux', 'Directrice du musée'] },
  { id: 'stade', pack: 'sorties', emoji: '🏟️', name: 'Le stade de foot', roles: ['Joueur', 'Arbitre', 'Entraîneur', 'Supporter', 'Gardien de but', 'Journaliste', 'Vendeur de boissons'] },
  { id: 'cirque', pack: 'sorties', emoji: '🎪', name: 'Le cirque', roles: ['Clown', 'Jongleur', 'Acrobate', 'Dompteur', 'Monsieur Loyal', 'Spectateur', 'Magicien'] },
  { id: 'concert', pack: 'sorties', emoji: '🎤', name: 'Le concert', roles: ['Chanteuse', 'Guitariste', 'Batteur', 'Fan au premier rang', 'Ingénieur du son', 'Agent de sécurité', 'Vendeur de tee-shirts'] },
  { id: 'bowling', pack: 'sorties', emoji: '🎳', name: 'Le bowling', roles: ['Joueur', 'Champion du quartier', 'Gérant', 'Serveur', 'Enfant avec les barrières', 'Réparateur de pistes', 'Supporter'] },
  { id: 'patinoire', pack: 'sorties', emoji: '⛸️', name: 'La patinoire', roles: ['Patineuse artistique', 'Débutant qui tombe', 'Joueur de hockey', 'Moniteur', 'Loueur de patins', 'Conducteur de la surfaceuse', 'Parent'] },
  { id: 'anniversaire', pack: 'sorties', emoji: '🎂', name: "La fête d'anniversaire", roles: ['Enfant qui fête son anniversaire', 'Invité', 'Parent', 'Magicien', 'Grand-mère', 'Pâtissier', 'Animateur'] },
  { id: 'mariage', pack: 'sorties', emoji: '💒', name: 'Le mariage', roles: ['Mariée', 'Marié', 'Témoin', 'Invité', 'Photographe', 'Traiteur', 'Enfant d’honneur'] },
  { id: 'marche', pack: 'sorties', emoji: '🧺', name: 'Le marché', roles: ['Marchand de fruits', 'Fromager', 'Poissonnier', 'Client', 'Fleuriste', 'Musicien de rue', 'Placier'] },

  // 🏰 Fantaisie
  { id: 'chateau', pack: 'fantaisie', emoji: '🏰', name: 'Le château fort', roles: ['Roi', 'Reine', 'Chevalier', 'Bouffon', 'Garde', 'Princesse', 'Dragon'] },
  { id: 'pirate', pack: 'fantaisie', emoji: '🏴‍☠️', name: 'Le bateau pirate', roles: ['Capitaine pirate', 'Matelot', 'Vigie', 'Cuisinier', 'Perroquet', 'Prisonnier', 'Chasseur de trésor'] },
  { id: 'fusee', pack: 'fantaisie', emoji: '🚀', name: 'Le vaisseau spatial', roles: ['Commandant', 'Astronaute', 'Pilote', 'Robot', 'Scientifique', 'Extraterrestre', 'Mécanicien'] },
  { id: 'magie', pack: 'fantaisie', emoji: '🧙', name: "L'école de magie", roles: ['Professeur de potions', 'Élève sorcier', 'Directeur', 'Hibou messager', 'Fantôme', 'Gardien', 'Cuisinier enchanté'] },
  { id: 'prehistoire', pack: 'fantaisie', emoji: '🦴', name: 'La grotte préhistorique', roles: ['Chef de la tribu', 'Chasseur', 'Peintre des parois', 'Cueilleuse', 'Enfant', 'Mammouth', 'Sorcier'] },
  { id: 'sousmarin', pack: 'fantaisie', emoji: '🌊', name: 'Le sous-marin', roles: ['Commandant', 'Sonariste', 'Mécanicien', 'Cuisinier', 'Scientifique', 'Plongeur', 'Pieuvre géante'] },
  { id: 'ile', pack: 'fantaisie', emoji: '🏝️', name: "L'île déserte", roles: ['Naufragé', 'Capitaine', 'Singe', 'Chercheur de trésor', 'Cuisinier', 'Perroquet', 'Crabe'] },
  { id: 'perenoel', pack: 'fantaisie', emoji: '🎅', name: "L'atelier du Père Noël", roles: ['Père Noël', 'Mère Noël', 'Lutin', 'Renne', 'Bonhomme de neige', 'Fabricant de jouets', 'Livreur de lettres'] },
  { id: 'jungle', pack: 'fantaisie', emoji: '🌴', name: 'La jungle', roles: ['Explorateur', 'Guide', 'Photographe', 'Singe', 'Serpent', 'Tigre', 'Botaniste'] },
  { id: 'labo', pack: 'fantaisie', emoji: '🧪', name: 'Le laboratoire du savant fou', roles: ['Savant fou', 'Assistant', 'Robot', 'Cobaye', 'Inventeur', 'Monstre', 'Journaliste curieux'] },
  { id: 'hantee', pack: 'fantaisie', emoji: '👻', name: 'La maison hantée', roles: ['Fantôme', 'Chasseur de fantômes', 'Visiteur peureux', 'Majordome', 'Vampire', 'Chat noir', 'Squelette'] },
];

export const placeById = (id) => PLACES.find((p) => p.id === id) || null;

/** Lieux des paquets choisis (tous si aucun paquet valide). */
export function placesForPacks(packs) {
  const ok = PLACES.filter((p) => packs.includes(p.pack));
  return ok.length ? ok : PLACES;
}

// 💡 Idées de questions passe-partout, pour aider les plus jeunes.
export const QUESTIONS = [
  'Tu viens souvent ici ?',
  'Qu’est-ce qu’on entend ici ?',
  'Il fait quel temps, ici ?',
  'Tu es venu comment ?',
  'Qu’est-ce que tu portes comme vêtements ?',
  'On mange quoi, ici ?',
  'Il y a beaucoup de monde ?',
  'C’est plutôt calme ou bruyant ?',
  'Tu restes combien de temps ?',
  'Tu as payé pour entrer ?',
  'Ça sent quoi ?',
  'Il y a des animaux ?',
  'Tu es plutôt dedans ou dehors ?',
  'On peut venir ici avec un bébé ?',
  'Tu préfères venir le jour ou la nuit ?',
  'Qu’est-ce que tu tiens dans tes mains ?',
  'Qui est le chef, ici ?',
  'Il faut être prudent ici ?',
  'Tu as amené quoi dans ton sac ?',
  'Tu t’amuses bien ?',
  'C’est loin de la maison ?',
  'On peut y aller à pied ?',
  'Tu viendrais ici pour ton anniversaire ?',
  'De quelle couleur sont les murs ?',
  'Il y a de l’eau près d’ici ?',
  'Tu travailles ou tu te reposes ?',
  'On a le droit de courir ?',
  'Tu as déjà eu peur ici ?',
  'Qu’est-ce qui est le plus important ici ?',
  'Il faut une tenue spéciale ?',
  'Tu y vas en été ou en hiver ?',
  'Tu as croisé quelqu’un de célèbre ?',
  'C’est grand ou petit ?',
  'Tu reviendras ?',
];
