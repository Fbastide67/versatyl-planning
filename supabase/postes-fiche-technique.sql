-- =====================================================================
--  Postes de la fiche technique Versatyl (novembre 2026)
--  À coller une seule fois dans le SQL Editor de Supabase.
--  Remplace les anciens postes des comptes déjà créés.
-- =====================================================================

update public.employees set role = 'Président'  where username = 'djmxpresident' and role = 'Gérant·e';
update public.employees set role = 'Trésorerie' where username = 'felix.bastide'  and role = 'Manager';
-- Les DJ ne sont pas dans la fiche : on garde « DJ », écrit pareil pour tout le monde
update public.employees set role = 'DJ' where lower(trim(role)) = 'dj';

-- Vérification : la liste doit afficher les nouveaux postes
select first_name, last_name, role from public.employees order by first_name;
