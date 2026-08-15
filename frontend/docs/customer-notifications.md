# Customer Activity Notifications

The Prime ERP system includes an automated customer notification feature that helps you maintain professional communication with your clients.

## How it Works
When specific business activities are completed, the system will automatically prepare a professional message and prompt you to send it via your device's default messaging application (WhatsApp or SMS).

### Triggered Activities
Notifications are triggered by the following actions:
1.  **Quotation Generation**: When a new quotation is saved for a customer.
2.  **Sales Invoice Creation**: When a sales invoice is processed (excluding POS transactions).
3.  **Examination Batch Approval**: When an examination batch is approved for a school.
4.  **Payment Processing**: When a customer payment is recorded (excluding POS payments).

## Configuration
You can enable or disable this feature in the **Settings > General** panel under the **Notifications & Communication** section.

### Toggle: Customer Activity Notifications
- **Enabled (Default)**: The system will trigger messaging app integration for all supported activities.
- **Disabled**: Automatic triggers are silenced. The system will require confirmation before disabling this feature.

## AI-Powered Templates
When you are online, the system uses AI to generate professional, appreciative, and business-encouraging messages tailored to the specific activity and customer. When offline, the system falls back to high-quality pre-defined templates.

## Offline Support
The notification system is designed to work offline. Rate limiting and activity logging are maintained using local storage (IndexedDB), ensuring consistent behavior even without an active internet connection.
