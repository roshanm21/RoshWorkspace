update storage.buckets
set public = false,
    file_size_limit = 26214400
where id = 'RWS-DBMS';

do $$
begin
  drop policy if exists "Allow public upload" on storage.objects;
  drop policy if exists "Allow public read access" on storage.objects;
  drop policy if exists "Public can upload rosh portfolio files" on storage.objects;
  drop policy if exists "Public can view rosh portfolio files" on storage.objects;
  drop policy if exists "Signed-in users can read RWS-DBMS files" on storage.objects;
  drop policy if exists "Signed-in users can upload RWS-DBMS files" on storage.objects;
  drop policy if exists "Users can update their RWS-DBMS profile files" on storage.objects;
  drop policy if exists "Signed-in users can update RWS-DBMS codebase files" on storage.objects;

  create policy "Signed-in users can read RWS-DBMS files"
    on storage.objects for select
    to authenticated
    using (
      bucket_id = 'RWS-DBMS'
      and (
        left(name, 6) <> 'users/'
        or split_part(name, '/', 2) = auth.uid()::text
      )
    );

  create policy "Signed-in users can upload RWS-DBMS files"
    on storage.objects for insert
    to authenticated
    with check (
      bucket_id = 'RWS-DBMS'
      and (
        (
          left(name, 6) = 'users/'
          and split_part(name, '/', 2) = auth.uid()::text
        )
        or (
          left(name, 8) <> '__likes/'
          and left(name, 6) <> 'users/'
        )
        or name = '__likes/' || auth.uid()::text || '.txt'
      )
    );

  create policy "Users can update their RWS-DBMS profile files"
    on storage.objects for update
    to authenticated
    using (
      bucket_id = 'RWS-DBMS'
      and left(name, 6) = 'users/'
      and split_part(name, '/', 2) = auth.uid()::text
    )
    with check (
      bucket_id = 'RWS-DBMS'
      and left(name, 6) = 'users/'
      and split_part(name, '/', 2) = auth.uid()::text
    );

  create policy "Signed-in users can update RWS-DBMS codebase files"
    on storage.objects for update
    to authenticated
    using (
      bucket_id = 'RWS-DBMS'
      and left(name, 9) = 'codebase/'
    )
    with check (
      bucket_id = 'RWS-DBMS'
      and left(name, 9) = 'codebase/'
    );
end
$$;
