import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

type AnnouncementEmailRecipient = {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private missingConfigLogged = false;

  constructor(private readonly configService: ConfigService) {}

  private getSmtpConfig() {
    const host = this.configService.get<string>('SMTP_HOST')?.trim() ?? '';
    const portRaw = this.configService.get<string>('SMTP_PORT')?.trim() ?? '';
    const user = this.configService.get<string>('SMTP_USER')?.trim() ?? '';
    const pass = this.configService.get<string>('SMTP_PASS') ?? '';
    const from = this.configService.get<string>('SMTP_FROM')?.trim() ?? '';
    const port = Number.parseInt(portRaw, 10);

    if (!host || !Number.isFinite(port) || !user || !pass || !from) {
      return null;
    }

    return {
      host,
      port,
      user,
      pass,
      from,
      secure: port === 465,
    };
  }

  private getTransporter() {
    if (this.transporter) {
      return this.transporter;
    }

    const config = this.getSmtpConfig();
    if (!config) {
      if (!this.missingConfigLogged) {
        this.logger.warn(
          'SMTP configuration missing. Announcement emails will be skipped.',
        );
        this.missingConfigLogged = true;
      }
      return null;
    }

    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });

    return this.transporter;
  }

  async sendAnnouncementEmails(options: {
    recipients: AnnouncementEmailRecipient[];
    title: string;
    body: string;
    announcementId: string;
  }) {
    const transporter = this.getTransporter();
    const config = this.getSmtpConfig();

    if (!transporter || !config || options.recipients.length === 0) {
      return { sent: 0, skipped: options.recipients.length };
    }

    const subject = `New announcement: ${options.title}`;

    const jobs = options.recipients.map((recipient) => {
      const displayName =
        `${recipient.firstName ?? ''} ${recipient.lastName ?? ''}`.trim() ||
        'there';

      const text = [
        `Hello ${displayName},`,
        '',
        `A new announcement has been posted: ${options.title}`,
        '',
        options.body,
        '',
        `Announcement ID: ${options.announcementId}`,
      ].join('\n');

      return transporter.sendMail({
        from: config.from,
        to: recipient.email,
        subject,
        text,
      });
    });

    const results = await Promise.allSettled(jobs);

    let sent = 0;
    let failed = 0;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        sent += 1;
      } else {
        failed += 1;
      }
    }

    if (failed > 0) {
      this.logger.warn(
        `Announcement email delivery had ${failed} failed recipient(s).`,
      );
    }

    return {
      sent,
      skipped: failed,
    };
  }
}
