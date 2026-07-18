export const WHATSAPP_PHONE = "23059883880"; // Owner's WhatsApp number (E.164 without +)
export const WHATSAPP_TEXT = "Hi, i need printing. What’s your price?";
export const CONTACT_EMAIL = "motshirtmauritius@gmail.com";
export const CONTACT_PHONE_DISPLAY = "+230 5988 3880";
export const CONTACT_TEL = "+23059883880";

export function getWhatsAppUrl(message: string = WHATSAPP_TEXT, phone: string = WHATSAPP_PHONE) {
  const text = encodeURIComponent(message);
  return `https://wa.me/${phone}?text=${text}`;
}

// Gallery images (put placeholders in /public/work)
export const workImages: string[] = [
  "/work/work-01.webp",
  "/work/work-02.webp",
  "/work/work-03.webp",
  "/work/work-04.webp",
  "/work/work-05.webp",
  "/work/work-06.webp",
  "/work/work-07.webp",
  "/work/work-08.webp",
  "/work/work-09.webp",
];
