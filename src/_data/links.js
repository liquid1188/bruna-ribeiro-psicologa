import site from "./site.json" with { type: "json" };
const wa = `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(site.whatsappMensagem || "")}`;
// When a booking link (Calendly or similar) is set in the editor, "Agendar" buttons use it; otherwise WhatsApp.
export default { whatsapp: wa, agendar: site.agendamentoUrl || wa };
