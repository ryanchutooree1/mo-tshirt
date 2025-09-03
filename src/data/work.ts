export const WHATSAPP_PHONE = "23059883880"; // Owner's WhatsApp number (E.164 without +)
export const WHATSAPP_TEXT = "Hi, I need printing.";
export const CONTACT_EMAIL = "motshirtmauritius@gmail.com";
export const CONTACT_PHONE_DISPLAY = "+230 5988 3880";
export const CONTACT_TEL = "+23059883880";

export function getWhatsAppUrl(message: string = WHATSAPP_TEXT, phone: string = WHATSAPP_PHONE) {
  const text = encodeURIComponent(message);
  return `https://wa.me/${phone}?text=${text}`;
}

// Gallery images (put placeholders in /public/work)
export const workImages: string[] = [
  "/work/work-01.JPG",
  "/work/work-02.JPG",
  "/work/work-03.JPG",
  "/work/work-04.JPG",
  "/work/work-05.JPG",
  "/work/work-06.JPG",
  "/work/work-07.JPG",
  "/work/work-08.JPG",
  "/work/work-09.JPG",
];
