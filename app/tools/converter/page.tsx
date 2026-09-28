import { Metadata } from 'next';
import { ToolPageShell } from '@/components/tools/ToolPageShell';

export const metadata: Metadata = {
  title: 'Booking Code Converter + Smart Filter',
  description: 'Move a slip from one platform to another without losing selections.',
};

export default function Page() {
  return (
    <ToolPageShell
      title="Booking Code Converter + Smart Filter"
      tagline="Move a slip from one platform to another without losing selections."
      status="soon"
      howItWorks={<p>The source code is decoded, each selection is matched to its equivalent on the target platform, and a Smart Filter flags anything that does not convert cleanly before a new code is generated.</p>}
      body={
        <div className="rounded-sm border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Coming soon</p>
          <p className="mt-1.5">
            This tool goes live once the Decode Service ships for its first platform. Check the
            Telegram bot for launch updates.
          </p>
        </div>
      }
    />
  );
}
