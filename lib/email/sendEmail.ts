import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export type SendEmailOptions = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string; // Standard: no-reply@deine-domain.com
};

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const { to, subject, html, text, from } = options;

  const { error } = await resend.emails.send({
    from: from ?? `ImmoHub <no-reply@${process.env.RESEND_FROM_DOMAIN ?? "myimmohub.com"}>`,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(`E-Mail konnte nicht gesendet werden: ${error.message}`);
  }
}
