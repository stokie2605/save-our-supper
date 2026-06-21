interface SmsWebhookPayload {
  orderId?: string;
  recipientPhone: string;
  recipientName: string;
  status: string;
  message: string;
}

const smsWebhookUrl = import.meta.env.VITE_SMS_WEBHOOK_URL as string | undefined;

export async function triggerSmsWebhook(payload: SmsWebhookPayload) {
  if (!smsWebhookUrl) {
    return { configured: false, sent: false };
  }

  const response = await fetch(smsWebhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`SMS webhook failed with status ${response.status}`);
  }

  return { configured: true, sent: true };
}
