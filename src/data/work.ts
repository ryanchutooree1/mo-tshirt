export const WHATSAPP_PHONE = "23059883880"; // Owner's WhatsApp number (E.164 without +)
export const WHATSAPP_TEXT = "Hi, i need printing. What’s your price?";
export const CONTACT_EMAIL = "motshirtmauritius@gmail.com";
export const CONTACT_PHONE_DISPLAY = "+230 5988 3880";
export const CONTACT_TEL = "+23059883880";

export function getWhatsAppUrl(message: string = WHATSAPP_TEXT, phone: string = WHATSAPP_PHONE) {
  const text = encodeURIComponent(message);
  return `https://wa.me/${phone}?text=${text}`;
}

// High-quality, display-sized gallery copies keep the public pages fast without
// changing the full-resolution source photos in /public/work.
export const workImages: string[] = [
  "/optimized/work-v2-01.webp",
  "/optimized/work-v2-02.webp",
  "/optimized/work-v2-03.webp",
  "/optimized/work-v2-04.webp",
  "/optimized/work-v2-05.webp",
  "/optimized/work-v2-06.webp",
  "/optimized/work-v2-07.webp",
  "/optimized/work-v2-08.webp",
  "/optimized/work-v2-09.webp",
];
