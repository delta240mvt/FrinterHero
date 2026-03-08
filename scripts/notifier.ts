interface RunSummary {
  runAt: Date;
  queriesCount: number;
  gapsFound: number;
  draftsGenerated: number;
}

export async function notifyDiscord(summary: RunSummary): Promise<void> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook || webhook.includes('placeholder')) {
    console.log('[Notifier] Discord webhook not configured, skipping notification');
    return;
  }

  const embed = {
    title: '🤖 GEO Monitor Run Complete',
    description: `Run completed at ${summary.runAt.toISOString()}`,
    color: summary.draftsGenerated > 0 ? 0xd6b779 : 0x4a8d83, // gold if drafts, teal otherwise
    fields: [
      { name: '📊 Queries Run', value: summary.queriesCount.toString(), inline: true },
      { name: '⚠️ Gaps Found', value: summary.gapsFound.toString(), inline: true },
      { name: '✍️ Drafts Generated', value: summary.draftsGenerated.toString(), inline: true },
    ],
    footer: { text: 'frinter. personal page GEO monitor' },
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed: ${response.status}`);
  }
}

export async function notifyEmail(summary: RunSummary): Promise<void> {
  // Optional: implement with Nodemailer if SMTP configured
  console.log('[Notifier] Email notification not implemented');
}
