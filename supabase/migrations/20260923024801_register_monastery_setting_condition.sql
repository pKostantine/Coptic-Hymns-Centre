-- The In Monastery Book Settings toggle raises this user-scoped condition.
-- Date-only calendar resolution must not activate it on its own.
insert into calendar.condition_flags
  (flag_key, flag_type, title_english, title_arabic, notes)
values
  ('Monastery', 'user_setting', 'In Monastery', 'في الدير',
   'Controlled by Book Settings > In Monastery. Passed as p_extra_context.Monastery for document condition evaluation; not date-derived.')
on conflict (flag_key) do nothing;
