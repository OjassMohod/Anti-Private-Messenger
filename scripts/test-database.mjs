// Real PostgreSQL tests in an isolated, disposable container. No production connection.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";

const container = `anti-private-test-${randomUUID().slice(0, 8)}`;
const image =
  "postgres:16-alpine@sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36";
const run = (args, input) =>
  execFileSync("docker", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const sql = (input) =>
  run(
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    input,
  );
try {
  run([
    "run",
    "--detach",
    "--rm",
    "--network",
    "none",
    "--name",
    container,
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    image,
    "-c",
    "wal_level=logical",
  ]);
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      run(["exec", container, "pg_isready", "-U", "postgres"]);
      ready = true;
      break;
    } catch {
      await setTimeout(250);
    }
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready");
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create publication supabase_realtime;`);
  sql(
    readFileSync(
      new URL("../supabase/migrations/001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  const output = sql(
    readFileSync(new URL("../test/database.sql", import.meta.url), "utf8"),
  );
  console.log(
    output
      .split("\n")
      .filter((line) => line.includes("PASS:"))
      .join("\n"),
  );
  sql(`insert into public.challenges(id,sender_id,recipient_id,cipher) values
    ('77777777-7777-4777-8777-777777777777','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','caesar');`);
  const concurrentSend = () =>
    new Promise((resolve, reject) => {
      const child = spawn("docker", [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ]);
      let error = "";
      child.stdout.resume();
      child.stderr.on("data", (chunk) => {
        error += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(error)),
      );
      child.stdin.end(`begin; set role service_role;
      select public.deliver_message('22222222-2222-4222-8222-222222222222','77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888','KHOOR','HELLO','encoded','fallback');
      select pg_sleep(0.2); commit;`);
    });
  await Promise.all([concurrentSend(), concurrentSend()]);
  sql(`do $$ begin
    if (select count(*) from public.broadcasts where id='88888888-8888-4888-8888-888888888888') <> 1 then raise exception 'Concurrent broadcast duplicated'; end if;
    if (select count(*) from public.inbox_messages where id='88888888-8888-4888-8888-888888888888') <> 1 then raise exception 'Concurrent inbox duplicated'; end if;
    end $$;`);
  console.log(
    "PASS: concurrent submissions commit one broadcast and one inbox message",
  );
  console.log(
    "PASS: migration, PostgreSQL RLS, function grants, idempotency and rollback checks completed.",
  );
} catch (error) {
  console.error(error.stderr?.toString() || error.message);
  process.exitCode = 1;
} finally {
  try {
    run(["rm", "--force", container]);
  } catch {
    /* Already removed or never started. */
  }
}
