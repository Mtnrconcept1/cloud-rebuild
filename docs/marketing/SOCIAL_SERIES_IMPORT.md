# Import d’une série de visuels sociaux

Le calendrier marketing permet à un administrateur connecté d’importer un `planning.csv` et les images JPG/PNG associées. Le CSV contient les colonnes `date`, `heure Europe/Zurich`, `canal`, `visuel`, `titre` et `légende` ; les colonnes supplémentaires sont ignorées. Une série comporte entre 1 et 32 lignes et accepte Instagram ou Facebook. Les noms d’images doivent être uniques, sans chemin, et chaque fichier doit peser au plus 3 Mo.

L’outil crée une campagne et ses publications en **brouillons** via l’opération idempotente `admin_create_marketing_campaign_bundle`. Il importe ensuite chaque image, dans l’ordre du CSV, par le BFF administrateur. Un échec peut être repris tant que l’écran reste ouvert : les images déjà enregistrées ne sont pas renvoyées. La campagne et chaque publication demandent une approbation avant planification. Si un créneau CSV est devenu passé, l’administrateur choisit un nouveau créneau à l’approbation.

Le serveur valide les octets du JPG/PNG, sa taille et ses dimensions, puis choisit un chemin unique dans le bucket `social-post-media`. La migration `20261026230000_marketing_social_image_upload.sql` attache uniquement ce nouveau visuel à une publication Instagram ou Facebook encore modifiable ; elle vérifie la version de l’élément et bloque toute campagne approuvée. L’opération d’attachement reste inaccessible à la route RPC générique. Un objet explicitement rejeté par SQL est supprimé ; un résultat ambigu est conservé pour éviter la suppression d’une image éventuellement attachée.

## Mise en service

1. Appliquer la migration Supabase avant de déployer le BFF et le frontend.
2. Exécuter les tests `marketing_social_image_upload.sql`, `marketing-mailing-image-bff.test.ts` et `marketing-social-series-import.test.tsx` sur un environnement jetable, ainsi que le typecheck et la validation habituelle du dépôt.
3. Dans **Marketing → Calendrier**, extraire l’archive des visuels, sélectionner `planning.csv` et les 20 PNG, puis lancer l’import. Vérifier les 20 aperçus et les légendes avant d’approuver la campagne et les publications.

La série n’est pas mise en ligne par ce changement de code. Le déploiement et l’import des fichiers dans l’instance de production nécessitent la fusion de la PR puis l’exécution du parcours dans le compte administrateur.
