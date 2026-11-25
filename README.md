# Warisat

## Configuration Supabase

Le site utilise Supabase Auth pour les comptes et `public.profiles` pour les abonnements. Les politiques RLS empêchent un utilisateur de modifier son échéance ou son statut. Les nouveaux comptes reçoivent un essai d’un jour.

1. Créez un projet Supabase et gardez son mot de passe de base de données privé.
2. Dans **SQL Editor**, exécutez [`supabase/schema.sql`](./supabase/schema.sql).
3. Créez le compte administrateur dans **Authentication → Users** avec **Add user**.
4. Dans le SQL Editor, promouvez ce compte administrateur. Remplacez l’adresse par la sienne :

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
   where email = 'ADMIN_EMAIL_HERE';
   ```

   Déconnectez puis reconnectez le compte pour renouveler son jeton d’accès.
5. Dans **Project Settings → API**, copiez l’URL du projet et la clé publique **anon/publishable** dans [`supabase-config.js`](./supabase-config.js). Ces deux valeurs sont destinées au navigateur. N’y mettez jamais une clé `service_role`.
6. Dans le tableau de bord Supabase, ajoutez `SUPABASE_SERVICE_ROLE_KEY` aux secrets des fonctions Edge. Déployez ensuite la fonction qui liste, crée, bloque, renouvelle et supprime les comptes :

   ```sh
   supabase login
   supabase link --project-ref VOTRE_PROJECT_REF
   supabase functions deploy admin-user-management
   ```

   La clé `service_role` reste uniquement dans les secrets Supabase et n’est jamais publiée dans le dépôt ou le navigateur.
7. Dans **Authentication → URL Configuration**, définissez l’URL publique Netlify comme **Site URL** pour les confirmations d’adresse e-mail.
8. Publiez le site. Les utilisateurs se créent depuis l’onglet **Créer un compte**; l’administrateur gère ensuite les renouvellements dans le panneau d’administration.

Les comptes de l’ancien système local ne sont pas importés : leurs mots de passe n’étaient pas stockés dans un format migrable vers Supabase Auth. Les utilisateurs devront créer un nouveau compte. Les paramètres et images d’apparence restent locaux au navigateur.

### Gestion directe depuis Supabase Studio

Dans **Authentication → Users**, utilisez **Add user** pour créer un compte. Le déclencheur SQL crée son profil avec un essai d’un jour. Pour bloquer ou débloquer un compte depuis le **SQL Editor**, exécutez :

```sql
select * from public.set_warisat_user_blocked('client@example.com', true);  -- bloquer
select * from public.set_warisat_user_blocked('client@example.com', false); -- débloquer
```

Pour renouveler un abonnement, utilisez une durée de `1`, `3`, `7`, `30`, `60` ou `365` jours. Le renouvellement repart de la date d’échéance si elle est encore valide, sinon de maintenant; il débloque également le compte :

```sql
select * from public.renew_warisat_subscription('client@example.com', 30);
```

Pour supprimer un compte, supprimez-le dans **Authentication → Users**. La clé étrangère supprime automatiquement son profil. Les fonctions SQL de blocage et de renouvellement sont exécutables par `postgres` (SQL Editor) et `service_role`, pas par les utilisateurs du site. Exécutez de nouveau [`supabase/schema.sql`](./supabase/schema.sql) pour installer ces fonctions si le schéma avait déjà été appliqué.

## Lecteur vidéo et application MPV

La version web inclut un lecteur HTML5 pour les URL directes de vidéo et les flux HLS. Les formats disponibles dépendent du navigateur; le serveur du flux doit autoriser la lecture depuis le site (CORS). La page ne peut pas lire ni réécrire les liens ouverts par les sites tiers intégrés dans l’iframe, car ils sont d’une autre origine.

La version desktop intercepte les ouvertures de nouvelle fenêtre des sites intégrés : les pages sont chargées dans la fenêtre Warisat et les URL directes de vidéo sont envoyées à MPV. MPV doit être installé séparément et accessible dans le `PATH` (`mpv` sur Linux/macOS, `mpv.exe` sur Windows). Pour indiquer un autre emplacement, définissez `MPV_PATH`.

```sh
npm install
npm start
npm test
```

Pour créer le paquet de la plateforme courante, lancez `npm run dist`. Les paquets ciblés se créent avec `npm run dist:win`, `npm run dist:mac` ou `npm run dist:linux`; la compilation de chaque cible doit être réalisée sur un environnement compatible avec cette plateforme. L’application desktop charge les mêmes fichiers locaux que le site et utilise la configuration publique de Supabase dans `supabase-config.js`.
