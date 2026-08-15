const axios = require('axios');

const META_API_VERSION = 'v22.0';
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;

class MetaWhatsAppService {
  constructor() {
    this.phoneNumberId = '';
    this.accessToken = '';
    this.configured = false;
  }

  setConfig(phoneNumberId, accessToken) {
    this.phoneNumberId = phoneNumberId;
    this.accessToken = accessToken;
    this.configured = !!(phoneNumberId && accessToken);
  }

  getStatus() {
    return {
      configured: this.configured,
      ready: this.configured,
      status: this.configured ? 'connected' : 'disconnected',
      phoneNumberId: this.phoneNumberId || null,
    };
  }

  async sendMessage(to, message) {
    if (!this.configured) {
      throw new Error('WhatsApp not configured. Set Phone Number ID and Access Token first.');
    }

    const res = await axios.post(
      `${META_GRAPH_URL}/${this.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to.replace(/[^0-9]/g, ''),
        type: 'text',
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      success: true,
      messageId: res.data.messages?.[0]?.id || `meta-${Date.now()}`,
    };
  }

  verifyCredentials() {
    if (!this.configured) return Promise.resolve(false);
    return axios
      .get(`${META_GRAPH_URL}/${this.phoneNumberId}`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      })
      .then(() => true)
      .catch(() => false);
  }
}

module.exports = new MetaWhatsAppService();
