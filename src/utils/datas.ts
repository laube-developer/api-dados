export const FUSO_HORARIO_PADRAO = "America/Sao_Paulo";

export function dataNoFuso(data: Date = new Date(), fuso: string = FUSO_HORARIO_PADRAO): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(data);
}

export function normalizarDataHoraIso(data: string): string {
    if (!data?.trim()) {
        return "";
    }

    const timestamp = Date.parse(data);

    if (Number.isNaN(timestamp)) {
        return data.trim();
    }

    return new Date(timestamp).toISOString();
}

export function datasHorasIguais(a: string, b: string): boolean {
    return normalizarDataHoraIso(a) === normalizarDataHoraIso(b);
}

export function diaSeguinte(data: string): string {
    const proximoDia = new Date(`${data}T12:00:00`);
    proximoDia.setDate(proximoDia.getDate() + 1);
    return dataNoFuso(proximoDia);
}