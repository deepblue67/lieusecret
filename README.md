# 🕵️ Le Lieu secret

Jeu de bluff et de déduction en famille ou entre amis. **Tout le monde connaît le lieu (la plage, l’école…), sauf l’espion.** On se pose des questions à tour de rôle : les joueurs essaient de démasquer l’espion, et l’espion essaie de deviner le lieu avant d’être repéré.

Le jeu est dans la même lignée qu’*Undercover famille* et *Buzzer* : même gestion des joueurs et des groupes, et Supabase Realtime pour jouer avec un téléphone par joueur.

▶️ **Jouer** : `https://lieusecret.cdesmottes.fr`

## ✨ Fonctionnalités

- 📱📱 **Un téléphone par joueur** : chacun voit sa carte en secret, le chrono, la liste des lieux à barrer, et vote sur son téléphone.
- 📱 **Ou un seul téléphone** qui passe de main en main : chacun regarde sa carte à son tour, puis le téléphone posé au milieu affiche le chrono et la liste des lieux. Les accusations se votent à main levée. Ce mode marche même sans connexion.
- 🔒 **Cartes vraiment secrètes** : chaque carte est chiffrée pour son seul destinataire. Ni les autres téléphones ni la TV ne peuvent la lire, même en fouillant le navigateur. La TV ne reçoit jamais le lieu ni le nom de l’espion avant la révélation.
- 👆 **Carte à retourner** : on garde le doigt dessus pour la voir, et elle se cache dès qu’on le lève.
- 🗺️ **42 lieux adaptés aux enfants** en 4 paquets : 🏠 Au quotidien, 🏖️ Vacances, 🎟️ Sorties, 🏰 Fantaisie. On choisit les paquets qui jouent.
- 🎭 **Rôles en option** : « tu es maître-nageur » à la plage. Désactivés par défaut, à activer dans les réglages.
- 🎤 **Tour de parole** (un téléphone par joueur) : celui qui doit poser la question choisit qui il interroge sur son écran, et la TV affiche « Léa ➜ Tom ». On ne peut pas reposer la question à celui qui vient de nous interroger.
- 💡 **Idées de questions** pour aider les plus jeunes.
- 🫵 **« J’accuse… »** : une accusation par joueur et par manche, le chrono s’arrête et tout le monde vote. Il faut l’unanimité (règle officielle) ou la majorité (réglage).
- 🕵️ **« Je suis l’espion… »** : l’espion choisit discrètement le lieu sur son écran. Le bouton est affiché sur tous les téléphones, pour que personne ne repère l’espion à son écran.
- ⏰ **Fin du chrono** : vote final secret sur les téléphones, ou « 3, 2, 1… montrez du doigt ! » avec un seul téléphone.
- 👥 **2 espions** à partir de 7 joueurs (réglable). Ils ne savent pas qui est l’autre.
- 👨‍👩‍👧‍👦 **Joueurs enregistrés et groupes** (Famille, Amis, Travail…), comme dans Undercover et Buzzer, avec **import depuis Undercover** (code `UCF2:` ou fichier).
- 🎩 Le maître du jeu peut **jouer aussi** sur son téléphone, ou seulement arbitrer.
- 📺 **Écran TV** : QR code, chrono géant, liste des lieux, tour de parole, votes, révélation, classement et podium.
- 🏁 Fin de partie au **nombre de manches** ou **« premier à X points »**, podium et trophées (Espion de génie, Fin limier, Devin).
- 🔄 **Changer de lieu** si quelqu’un ne comprend pas sa carte, ⏸ pause, ↩️ annuler, correction des scores.
- 💾 Un téléphone qui recharge sa page ou se met en veille retrouve sa place, ses points **et sa carte**. Si le maître du jeu recharge sa page, la partie est restaurée.
- ✈️ Installable sur l’écran d’accueil (PWA). La page n’est pas référencée par les moteurs de recherche.

## 🎲 Règles

1. Chacun découvre sa carte en secret : le lieu, ou « Tu es l’espion ! ».
2. Un premier joueur, tiré au sort, pose une question à quelqu’un (« Tu viens souvent ici ? »). Celui qui a répondu pose la question suivante à qui il veut, sauf à celui qui vient de l’interroger.
3. Les questions et les réponses doivent être assez précises pour prouver qu’on connaît le lieu… sans l’être trop, sinon l’espion le devine !
4. À tout moment :
   - un joueur peut lancer **« J’accuse… »** (une fois par manche). Le chrono s’arrête et tout le monde vote, sauf l’accusé. Si le vote passe, la manche s’arrête et l’accusé dévoile son rôle. Sinon, le chrono repart ;
   - l’espion peut **se dévoiler** et tenter de deviner le lieu (une seule tentative).
5. Quand le chrono arrive à zéro, chacun désigne l’espion. Le joueur le plus désigné est accusé s’il a assez de voix (unanimité ou majorité). En cas d’égalité, l’espion s’en sort.

| Situation | Points |
|---|---|
| Espion pas démasqué à la fin du chrono | +2 pour l’espion |
| Innocent accusé à tort | +4 pour l’espion |
| Espion qui devine le lieu | +4 (+2 pour l’autre espion s’il y en a deux) |
| Espion démasqué, ou qui se trompe de lieu | +1 pour chaque innocent |
| Celui qui a lancé l’accusation qui démasque l’espion | +1 en plus (donc +2) |

Les points se changent dans l’objet `POINTS` de `js/game.js`.

## 🎮 Jouer

### 📱📱 Un téléphone par joueur (mode par défaut)

1. Le maître du jeu ouvre le site, puis **Créer une partie**. Un code de 4 lettres et un QR code s’affichent.
2. Il choisit le **groupe qui joue** et indique s’il **joue aussi** (son prénom) ou s’il arbitre seulement.
3. Les joueurs scannent le QR code, puis choisissent leur prénom dans la liste ou en tapent un nouveau.
4. **🃏 Distribuer les cartes** : chacun garde le doigt sur sa carte pour la voir, puis touche « J’ai vu ma carte ». Le chrono démarre quand tout le monde l’a vue (ou avec « ⏩ Lancer le chrono »).
5. On joue ! À la fin de la manche, le maître du jeu lance **▶ Manche suivante**.

### 📱 Un seul téléphone

1. **Créer une partie**, puis **📱 Un seul téléphone** (ou ⚙️ → Téléphones).
2. **Qui joue ?** : touche les joueurs enregistrés, ou ajoute-les avec le champ « Ajouter un joueur ». Il en faut au moins 3.
3. **🃏 Distribuer les cartes** : « Passe le téléphone à Léa » → Léa touche « C’est moi », garde le doigt sur la carte, puis « J’ai retenu ✓ ». Et ainsi de suite.
4. Le téléphone est posé au milieu : chrono, liste des lieux, premier joueur à poser une question.
5. **🫵 Accusation** : on indique qui accuse qui, puis on vote à main levée. **🕵️ L’espion se dévoile** : l’espion dit son prénom et choisit le lieu.

### Réglages ⚙️

Téléphones, durée de la manche (4, 6, 8 ou 10 min), nombre d’espions, unanimité ou majorité, rôles, paquets de lieux, fin de partie, sons, lien de l’écran TV, nouvelle partie, nouvelle salle.

## 📺 Écran TV

Sur la TV, une tablette ou un PC : ouvre la page d’accueil puis **📺 Ouvrir l’écran TV**, et tape le code (le lien direct est aussi dans les réglages du maître du jeu). Touche **Lancer l’écran** pour activer le son. Ça marche dans les deux modes. En mode un seul téléphone, il faut internet pour la TV.

## 🚀 Mise en ligne

### 1. Supabase

> ✅ **Déjà fait** : `js/config.js` utilise le même projet Supabase qu’*Undercover famille* et *Buzzer*. Les canaux `lieu:XXXX` ne se mélangent pas avec ceux des autres jeux.

Aucune table ni aucun script SQL n’est nécessaire : l’appli n’utilise que les canaux *Broadcast* et *Presence* de Supabase Realtime. La clé « publishable » est faite pour être publique. Ne mets jamais la clé `secret` dans le code.

### 2. GitHub Pages

1. Crée un dépôt (par exemple `lieu-secret`) et pousse le contenu de ce dossier à la racine.
2. **Settings → Pages → Build and deployment** : choisis **Deploy from a branch**, puis la branche `main` et le dossier `/ (root)`.
3. Le fichier `CNAME` contient `lieusecret.cdesmottes.fr`. Chez ton registrar DNS, crée un enregistrement **CNAME** `lieusecret` → `<ton-pseudo-github>.github.io`, puis coche **Enforce HTTPS** dans GitHub Pages.

> Le **HTTPS** est indispensable : sans lui, pas de chiffrement des cartes, d’écran toujours allumé ni de son fiable sur mobile. GitHub Pages le fournit.
>
> Après une mise à jour, change `VERSION` dans `sw.js` pour que les téléphones récupèrent la nouvelle version.

## 🧪 Tester sans Supabase (mode local)

Ajoute `?local=1` à l’adresse : les onglets d’un **même navigateur** jouent entre eux.

```bash
python -m http.server 8000
# puis http://localhost:8000/?local=1 (un onglet maître du jeu, plusieurs onglets joueurs)
```

Tests automatiques (Node 18 ou plus) :

```bash
node --test tests/game.test.mjs tests/roster.test.mjs
```

## 🛠️ Personnaliser

- **Ajouter un lieu** : une ligne dans `PLACES` (`js/places.js`), avec un `id` unique, le paquet, un emoji, le nom et au moins 6 rôles.
- **Ajouter un paquet** : une entrée dans `PACKS`, puis des lieux avec ce paquet.
- **Idées de questions** : tableau `QUESTIONS` dans `js/places.js`.
- **Points** : objet `POINTS` dans `js/game.js`.

## 🗂️ Fichiers

```
index.html        accueil (rejoindre / créer / écran TV)
host.html         maître du jeu (les deux modes)
play.html         joueur (un téléphone par joueur)
tv.html           écran du salon
css/style.css     tout le style
js/config.js      URL + clé Supabase
js/game.js        règles : distribution, tour de parole, accusations, votes, points (pur, testé)
js/places.js      les 42 lieux, leurs rôles et les idées de questions
js/secure.js      chiffrement des cartes (ECDH + AES-GCM, WebCrypto)
js/transport.js   Supabase Realtime (Broadcast + Presence) ou mode local
js/roster.js      joueurs enregistrés, groupes, import Undercover (repris de Buzzer)
js/ui.js          rendu partagé (carte, lieux, accusation, révélation, classement, podium)
js/fx.js          sons synthétisés, vibrations, confettis
js/host.js · play.js · tv.js · home.js   logique de chaque page
js/vendor/        supabase-js et qrcode-generator (licence MIT)
sw.js             mode hors ligne
tests/            tests des règles et des joueurs enregistrés
```

## ⚠️ Limites assumées

- En mode un téléphone par joueur, il faut une connexion internet (Wi-Fi ou 4G).
- Le maître du jeu doit garder son téléphone allumé avec le jeu ouvert : c’est lui qui garde le lieu et l’espion. L’appli empêche la mise en veille quand le navigateur le permet.
- Les joueurs enregistrés sont gardés sur le téléphone du maître du jeu : pour reprendre ceux d’Undercover, utilise l’import (👥 → Importer depuis Undercover).
- Les actions des joueurs ne sont pas signées : un joueur très bricoleur pourrait envoyer un faux vote. Les cartes, elles, restent illisibles pour les autres. C’est acceptable pour un jeu en famille ou entre amis.
- L’iPhone ne permet pas la vibration depuis un site web.

## 📄 Licence

MIT. Fait avec ❤️ pour les soirées en famille. [cdesmottes.fr](https://cdesmottes.fr)
