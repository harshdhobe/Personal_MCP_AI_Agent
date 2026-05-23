/**
 * Format pending send confirmation for chat.
 * @param {{ to: string; subject: string; body: string; thread_id?: string }} draft
 */
export function formatSendConfirmation(draft) {
  const bodyPreview =
    draft.body.length > 500 ? `${draft.body.slice(0, 500)}…` : draft.body;
  return [
    "Ready to send this email:",
    "",
    `To: ${draft.to}`,
    `Subject: ${draft.subject}`,
    "",
    bodyPreview,
    "",
    "Reply YES to send, or NO to cancel.",
  ].join("\n");
}
