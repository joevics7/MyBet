import { Metadata } from 'next';
import { ToolPageShell } from '@/components/tools/ToolPageShell';
import { VaultManager } from '@/components/tools/VaultManager';

export const metadata: Metadata = {
  title: 'Bet Code Vault + Auto Result Checker',
  description: "Save a code once — get a plain-language result when every leg settles.",
};

export default function Page() {
  return (
    <ToolPageShell
      title="Bet Code Vault + Auto Result Checker"
      tagline="Save a code once — get a plain-language result when every leg settles."
      status="live"
      howItWorks={
        <>
          <p>
            Connect your Telegram (no email, no password), save a booking code, and we&rsquo;ll
            message you on Telegram the moment it settles. Saved codes are checked every hour.
            SportyBet codes check automatically against the same decode data that powers the
            Decoder &mdash; Bet9ja codes can be saved but can&rsquo;t auto-check yet, since Bet9ja
            doesn&rsquo;t report match results the way SportyBet does.
          </p>
          <p>
            Results are shown plainly — a loss is labeled a loss, not softened or buried.
          </p>
        </>
      }
      body={<VaultManager />}
    />
  );
}
