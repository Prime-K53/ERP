const nodemailer = require('nodemailer');

const getTransporter = () => {
  if (process.env.NODE_ENV === 'production' && (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS)) {
    throw new Error('SMTP configuration missing in production.');
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const getFrom = (senderName) => {
  const defaultFrom = process.env.SMTP_FROM || 'noreply@primeerp.com';
  if (senderName) {
    return `"${senderName}" <${defaultFrom}>`;
  }
  return `"Prime ERP System" <${defaultFrom}>`;
};

const sendEmail = async ({ to, subject, text, html, senderName }) => {
  const transporter = getTransporter();
  const mailOptions = {
    from: getFrom(senderName),
    to,
    subject,
    text,
    html,
  };
  const info = await transporter.sendMail(mailOptions);
  return { success: true, messageId: info.messageId };
};

const sendEmailWithAttachment = async (options) => {
  const { to, subject, body, filename, content, contentType = 'application/pdf', senderName } = options;

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error('CRITICAL: SMTP configuration missing in production. Email sending aborted.');
      throw new Error('SMTP configuration missing in production.');
    }
  }

  const transporter = getTransporter();
  const mailOptions = {
    from: getFrom(senderName),
    to: to,
    subject: subject,
    text: body,
    attachments: [
      {
        filename: filename,
        content: content,
        contentType: contentType
      }
    ]
  };

  try {
    let info = await transporter.sendMail(mailOptions);
    console.log('Email sent: %s', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
};

module.exports = {
  sendEmail,
  sendEmailWithAttachment
};
