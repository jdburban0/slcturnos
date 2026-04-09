import { prisma } from "./prisma.js";

/**
 * Envía un mensaje de WhatsApp al número configurado en Ajustes usando CallMeBot.
 * Si no está configurado, falla silenciosamente para no interrumpir el flujo.
 */
export async function sendWhatsApp(text) {
    try {
        const [phoneSetting, keySetting] = await Promise.all([
            prisma.setting.findUnique({ where: { key: "whatsapp_phone" } }),
            prisma.setting.findUnique({ where: { key: "whatsapp_apikey" } }),
        ]);

        const phone = phoneSetting?.value;
        const apikey = keySetting?.value;

        if (!phone || !apikey) return; // No configurado, omitir silenciosamente

        const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
        await fetch(url);
    } catch (err) {
        console.error("[WhatsApp] Error al enviar notificación:", err.message);
    }
}
