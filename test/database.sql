\set ON_ERROR_STOP on
insert into auth.users(id) values
('11111111-1111-4111-8111-111111111111'),
('22222222-2222-4222-8222-222222222222'),
('33333333-3333-4333-8333-333333333333');
insert into public.profiles(id,username) select id, case left(id::text,1) when '1' then 'Alice' when '2' then 'Bob' else 'Charlie' end from auth.users;

set role service_role;
select public.issue_challenge('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','caesar')->>'id' as challenge_id \gset
select public.deliver_message('11111111-1111-4111-8111-111111111111', :'challenge_id','44444444-4444-4444-8444-444444444444','KHOOR','HELLO','Gur zbba vf bhe znantre.','fallback');
select public.deliver_message('11111111-1111-4111-8111-111111111111', :'challenge_id','44444444-4444-4444-8444-444444444444','KHOOR','HELLO','QVSSRERAG','fallback');
reset role;
do $$ begin
  if (select count(*) from public.broadcasts) <> 1 or (select count(*) from public.inbox_messages) <> 1 then raise exception 'Duplicate send created rows'; end if;
  if (select ciphertext from public.inbox_messages limit 1) <> 'Gur zbba vf bhe znantre.' then raise exception 'Retry overwrote inbox'; end if;
end $$;
\echo PASS: service-only delivery and duplicate retry

set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $$ begin
  if (select count(*) from public.broadcasts) <> 0 then raise exception 'Recipient can read original'; end if;
  if (select count(*) from public.broadcasts where id='44444444-4444-4444-8444-444444444444') <> 0 then raise exception 'Known-ID query bypassed RLS'; end if;
  if (select count(*) from public.inbox_messages) <> 1 then raise exception 'Recipient cannot read inbox'; end if;
  begin perform * from public.challenges; raise exception 'Client read challenges'; exception when insufficient_privilege then null; end;
  begin perform public.issue_challenge('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','caesar'); raise exception 'Client called challenge RPC'; exception when insufficient_privilege then null; end;
  begin perform public.deliver_message('22222222-2222-4222-8222-222222222222',gen_random_uuid(),gen_random_uuid(),'x','x','x','fallback'); raise exception 'Client called delivery RPC'; exception when insufficient_privilege then null; end;
  begin insert into public.broadcasts(id,challenge_id,sender_id,recipient_id,original) values(gen_random_uuid(),gen_random_uuid(),auth.uid(),'11111111-1111-4111-8111-111111111111','forged'); raise exception 'Client inserted broadcast'; exception when insufficient_privilege then null; end;
  begin update public.inbox_messages set ciphertext='tampered'; raise exception 'Client updated inbox'; exception when insufficient_privilege then null; end;
  begin delete from public.broadcasts; raise exception 'Client deleted broadcasts'; exception when insufficient_privilege then null; end;
end $$;
\echo PASS: Bob excluded, including by ID; inbox readable; client writes/RPCs/challenges denied

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$ begin
  if (select count(*) from public.broadcasts) <> 1 then raise exception 'Alice cannot see broadcast'; end if;
  if (select count(*) from public.inbox_messages) <> 0 then raise exception 'Sender can read inbox'; end if;
  update public.profiles set username='forged' where id='22222222-2222-4222-8222-222222222222';
  if (select username from public.profiles where id='22222222-2222-4222-8222-222222222222') <> 'Bob' then raise exception 'Changed another profile'; end if;
  begin update public.profiles set id='99999999-9999-4999-8999-999999999999' where id=auth.uid(); raise exception 'Client changed identity'; exception when insufficient_privilege then null; end;
end $$;
\echo PASS: sender sees broadcast but cannot read recipient inbox or alter another identity

select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $$ begin
  if (select count(*) from public.broadcasts) <> 1 then raise exception 'Charlie cannot read broadcast'; end if;
  if (select count(*) from public.inbox_messages) <> 0 then raise exception 'Observer can read inbox'; end if;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform * from public.broadcasts; raise exception 'Unauthenticated read'; exception when insufficient_privilege then null; end;
  begin perform * from public.profiles; raise exception 'Unauthenticated profiles read'; exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo PASS: observer access and unauthenticated denial

-- Failure of the second insert must roll back the first insert and challenge consumption.
insert into public.challenges(id,sender_id,recipient_id,cipher,created_at) values
('55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','atbash',now()-interval '1 minute');
set role service_role;
do $$ begin
  begin
    perform public.deliver_message('33333333-3333-4333-8333-333333333333','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','SVOOL','HELLO','','fallback');
    raise exception 'Invalid inbox unexpectedly accepted';
  exception when check_violation then null;
  end;
end $$;
reset role;
do $$ begin
  if exists(select 1 from public.broadcasts where id='66666666-6666-4666-8666-666666666666') then raise exception 'Partial broadcast survived'; end if;
  if exists(select 1 from public.challenges where id='55555555-5555-4555-8555-555555555555' and used_at is not null) then raise exception 'Failed transaction consumed challenge'; end if;
  if (select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename in ('broadcasts','inbox_messages')) <> 2 then raise exception 'Realtime tables not published'; end if;
end $$;
\echo PASS: atomic rollback and Realtime publication

set role service_role;
do $$ begin
  begin
    perform public.issue_challenge('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','caesar');
    raise exception 'Self-recipient was accepted';
  exception when raise_exception then if sqlerrm <> 'INVALID_RECIPIENT' then raise; end if; end;
  begin
    perform public.issue_challenge('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','caesar');
    raise exception 'Challenge cooldown bypassed';
  exception when raise_exception then if sqlerrm <> 'TOO_FAST' then raise; end if; end;
  begin
    perform public.deliver_message('22222222-2222-4222-8222-222222222222','55555555-5555-4555-8555-555555555555',gen_random_uuid(),'SVOOL','HELLO','encoded','fallback');
    raise exception 'Another sender used a challenge';
  exception when raise_exception then if sqlerrm <> 'CHALLENGE_INVALID' then raise; end if; end;
end $$;
reset role;
update public.challenges set expires_at=now()-interval '1 second' where id='55555555-5555-4555-8555-555555555555';
set role service_role;
do $$ begin
  begin
    perform public.deliver_message('33333333-3333-4333-8333-333333333333','55555555-5555-4555-8555-555555555555',gen_random_uuid(),'SVOOL','HELLO','encoded','fallback');
    raise exception 'Expired challenge accepted';
  exception when raise_exception then if sqlerrm <> 'CHALLENGE_INVALID' then raise; end if; end;
end $$;
reset role;
\echo PASS: self-recipient, cooldown, ownership and expiry validation
