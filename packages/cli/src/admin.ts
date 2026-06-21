import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { Command } from 'commander';

loadDotenv({ path: resolve(process.cwd(), '.env'), quiet: true });

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

const ok = (s: string) => `${GREEN}${s}${RESET}`;
const fail = (s: string) => `${RED}${s}${RESET}`;
const dim = (s: string) => `${DIM}${s}${RESET}`;
const bold = (s: string) => `${BOLD}${s}${RESET}`;

function getAdminSecret(): string {
  const s = process.env.ADMIN_SECRET;
  if (!s) {
    process.stderr.write('ADMIN_SECRET not set. Add it to your .env file.\n');
    process.exit(1);
  }
  return s;
}

function resolveApiUrl(override?: string): string {
  return override ?? process.env.UISEAL_API_URL ?? 'http://localhost:3001';
}

interface ApiFetchOpts extends Omit<RequestInit, 'headers'> {
  adminSecret: string;
}

async function apiFetch(url: string, { adminSecret, ...rest }: ApiFetchOpts): Promise<Response> {
  try {
    return await fetch(url, {
      ...rest,
      headers: {
        ...(rest.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
        'x-admin-secret': adminSecret,
      },
    });
  } catch {
    let origin = url;
    try { origin = new URL(url).origin; } catch { /* use full url as-is */ }
    process.stderr.write(`Cannot reach API at ${origin}. Is the server running?\n`);
    return process.exit(1);
  }
}

const toDate = (iso: string) => iso.slice(0, 10);

interface Team {
  id: string;
  name: string;
  plan: string;
  trialEndsAt: string | null;
  token: string;
}

const program = new Command();
program
  .name('uiseal-admin')
  .description('UISeal admin — manage trials and teams')
  .option('--api-url <url>', 'Override UISEAL_API_URL for this call');

// ── grant ────────────────────────────────────────────────────────────────────

program
  .command('grant <emailOrToken>')
  .description('Grant a trial to a team')
  .option('-d, --days <n>', 'Number of days (required, 1–365)')
  .option('-n, --note <text>', 'Optional note, e.g. "meet.js Kraków demo"')
  .action(async (emailOrToken: string, opts: { days?: string; note?: string }) => {
    const adminSecret = getAdminSecret();
    const apiUrl = resolveApiUrl(program.opts().apiUrl as string | undefined);

    if (!opts.days) {
      process.stderr.write("error: required option '-d, --days <n>' not specified\n");
      process.exit(1);
    }
    const days = parseInt(opts.days, 10);
    if (isNaN(days) || days < 1 || days > 365) {
      process.stderr.write('--days must be an integer between 1 and 365\n');
      process.exit(1);
    }

    let grantBody: Record<string, unknown>;

    if (emailOrToken.includes('@')) {
      // Email provided: look up team by name match
      const listRes = await apiFetch(`${apiUrl}/admin/teams`, { adminSecret, method: 'GET' });
      if (!listRes.ok) {
        const e = (await listRes.json()) as { error?: string };
        process.stdout.write(`${fail('✗')} Failed: ${e.error ?? listRes.statusText}\n`);
        process.exit(1);
      }
      const { teams } = (await listRes.json()) as { teams: Team[] };
      const match = teams.find(t => t.name.toLowerCase().includes(emailOrToken.toLowerCase()));
      if (!match) {
        process.stdout.write(`${fail('✗')} No team found matching "${emailOrToken}"\n`);
        process.exit(1);
      }
      grantBody = { teamId: match.id, days, ...(opts.note ? { note: opts.note } : {}) };
    } else {
      grantBody = { token: emailOrToken, days, ...(opts.note ? { note: opts.note } : {}) };
    }

    const res = await apiFetch(`${apiUrl}/admin/grant-trial`, {
      adminSecret,
      method: 'POST',
      body: JSON.stringify(grantBody),
    });
    const data = (await res.json()) as {
      success?: boolean;
      token?: string;
      trialEndsAt?: string;
      daysGranted?: number;
      error?: string;
    };

    if (!res.ok || !data.success) {
      process.stdout.write(`${fail('✗')} Failed: ${data.error ?? 'Unknown error'}\n`);
      process.exit(1);
    }

    const expires = toDate(data.trialEndsAt ?? '');

    process.stdout.write(`${ok('✓')} Trial granted\n`);
    process.stdout.write(`\x1b[33m⚠ This token will only be shown once. Store it securely and share it with the customer over a secure channel (not Slack/email in plaintext if avoidable).\x1b[0m\n`);
    process.stdout.write(`  Token:    ${bold(data.token ?? '')}\n`);
    process.stdout.write(`  Plan:     trial\n`);
    process.stdout.write(`  Expires:  ${expires} (${data.daysGranted} days from now)\n`);
    if (opts.note) process.stdout.write(`  Note:     ${opts.note}\n`);
  });

// ── revoke ───────────────────────────────────────────────────────────────────

program
  .command('revoke <token>')
  .description('Revoke a trial or downgrade team to free plan')
  .action(async (token: string) => {
    const adminSecret = getAdminSecret();
    const apiUrl = resolveApiUrl(program.opts().apiUrl as string | undefined);

    const res = await apiFetch(`${apiUrl}/admin/revoke`, {
      adminSecret,
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    const data = (await res.json()) as { success?: boolean; error?: string };

    if (!res.ok || !data.success) {
      process.stdout.write(`${fail('✗')} Failed: ${data.error ?? 'Unknown error'}\n`);
      process.exit(1);
    }

    process.stdout.write(`${ok('✓')} Token revoked. Team downgraded to free plan.\n`);
  });

// ── teams ────────────────────────────────────────────────────────────────────

program
  .command('teams')
  .description('List all teams with their status')
  .action(async () => {
    const adminSecret = getAdminSecret();
    const apiUrl = resolveApiUrl(program.opts().apiUrl as string | undefined);

    const res = await apiFetch(`${apiUrl}/admin/teams`, { adminSecret, method: 'GET' });
    const data = (await res.json()) as { teams?: Team[]; error?: string };

    if (!res.ok || !data.teams) {
      process.stdout.write(`${fail('✗')} Failed: ${data.error ?? 'Unknown error'}\n`);
      process.exit(1);
    }

    const { teams } = data;
    if (teams.length === 0) {
      process.stdout.write(dim('No teams found.\n'));
      return;
    }

    const W = { token: 18, plan: 12, expires: 14 };

    const hdr =
      'Token'.padEnd(W.token) +
      'Plan'.padEnd(W.plan) +
      'Expires'.padEnd(W.expires) +
      'Note';
    process.stdout.write(bold(hdr) + '\n');
    process.stdout.write(dim('─'.repeat(W.token + W.plan + W.expires + 4)) + '\n');

    for (const t of teams) {
      process.stdout.write(
        t.token.padEnd(W.token) +
        t.plan.padEnd(W.plan) +
        (t.trialEndsAt ? toDate(t.trialEndsAt) : '—').padEnd(W.expires) +
        '—\n',
      );
    }
  });

// ── token-for ────────────────────────────────────────────────────────────────

program
  .command('token-for <email>')
  .description('Find token for a team by searching team name/email fields')
  .action(async (email: string) => {
    const adminSecret = getAdminSecret();
    const apiUrl = resolveApiUrl(program.opts().apiUrl as string | undefined);

    const res = await apiFetch(`${apiUrl}/admin/teams`, { adminSecret, method: 'GET' });
    const data = (await res.json()) as { teams?: Team[]; error?: string };

    if (!res.ok || !data.teams) {
      process.stdout.write(`${fail('✗')} Failed: ${data.error ?? 'Unknown error'}\n`);
      process.exit(1);
    }

    const match = data.teams.find(t =>
      t.name.toLowerCase().includes(email.toLowerCase()),
    );
    if (!match) {
      process.stdout.write(`${fail('✗')} No team found matching "${email}"\n`);
      process.exit(1);
    }

    process.stdout.write(`Token:   ${bold(match.token)}\n`);
    process.stdout.write(`Plan:    ${match.plan}\n`);
    process.stdout.write(`Expires: ${match.trialEndsAt ? toDate(match.trialEndsAt) : '—'}\n`);
  });

program.parse();
