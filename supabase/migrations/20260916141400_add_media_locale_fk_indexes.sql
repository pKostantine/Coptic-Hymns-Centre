create index if not exists localized_texts_locale_idx
  on media.localized_texts(locale);

create index if not exists search_documents_locale_idx
  on media.search_documents(locale)
  where locale is not null;

create index if not exists search_aliases_locale_idx
  on media.search_aliases(locale)
  where locale is not null;
