export const FUSO_HORARIO_PADRAO = "America/Sao_Paulo";
export function dataNoFuso(data = new Date(), fuso = FUSO_HORARIO_PADRAO) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(data);
}
export function normalizarDataHoraIso(data) {
    if (!data?.trim()) {
        return "";
    }
    const timestamp = Date.parse(data);
    if (Number.isNaN(timestamp)) {
        return data.trim();
    }
    return new Date(timestamp).toISOString();
}
export function datasHorasIguais(a, b) {
    return normalizarDataHoraIso(a) === normalizarDataHoraIso(b);
}
export function diaSeguinte(data) {
    const proximoDia = new Date(`${data}T12:00:00`);
    proximoDia.setDate(proximoDia.getDate() + 1);
    return dataNoFuso(proximoDia);
}
//# sourceMappingURL=datas.js.map