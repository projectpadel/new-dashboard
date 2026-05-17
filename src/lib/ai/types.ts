export type AiPdfAttachment = {
  filename: string;
  mimeType: "application/pdf";
  base64: string;
};

export type AiChatResult = {
  reply: string;
  attachments: AiPdfAttachment[];
};
