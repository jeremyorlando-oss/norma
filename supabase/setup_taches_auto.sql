-- NORMA · tâches automatiques (à lancer UNE FOIS, après 006 et après avoir créé les 3 fonctions serveur).
-- Chaque minute : notifications iPhone. Chaque heure (à :05) : rapport de la veille par e-mail, à l'heure choisie dans l'app.
-- Le secret envoyé est lu dans la base au moment de l'appel : rien à copier.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobname) from cron.job where jobname in ('norma-notifications', 'norma-rapport-soir');

select cron.schedule('norma-notifications', '* * * * *', $$
  select net.http_post(url := 'https://hnvaabrjafxhoxvjavjz.supabase.co/functions/v1/notifications',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-norma-cron', (select secret from norma.cron_secret)),
    body := '{}'::jsonb, timeout_milliseconds := 20000)
$$);

select cron.schedule('norma-rapport-soir', '5 * * * *', $$
  select net.http_post(url := 'https://hnvaabrjafxhoxvjavjz.supabase.co/functions/v1/rapport-soir',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-norma-cron', (select secret from norma.cron_secret)),
    body := '{}'::jsonb, timeout_milliseconds := 60000)
$$);

select jobname, schedule from cron.job where jobname like 'norma-%';
