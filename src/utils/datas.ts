export const FUSO_HORARIO_PADRAO = "America/Sao_Paulo";

export function dataNoFuso(data: Date = new Date(), fuso: string = FUSO_HORARIO_PADRAO): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(data);
}

function obterOffsetIso(dataUtc: Date, fuso: string = FUSO_HORARIO_PADRAO): string {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: fuso,
        timeZoneName: "longOffset",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(dataUtc);

    const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-3";
    const match = tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
    if (!match) {
        return "-03:00";
    }

    const sinal = match[1] ?? "-";
    const horas = (match[2] ?? "3").padStart(2, "0");
    const minutos = (match[3] ?? "00").padStart(2, "0");
    return `${sinal}${horas}:${minutos}`;
}

/**
 * Formata um instante real no fuso da clínica (ex.: 2026-07-15T08:00:00-03:00).
 * Preserva o momento no tempo (não reinterpreta o relógio).
 */
export function normalizarDataHoraIso(data: string, fuso: string = FUSO_HORARIO_PADRAO): string {
    if (!data?.trim()) {
        return "";
    }

    const timestamp = Date.parse(data);

    if (Number.isNaN(timestamp)) {
        return data.trim();
    }

    const instante = new Date(timestamp);
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: fuso,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(instante);

    const get = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((p) => p.type === type)?.value ?? "00";

    const ymd = `${get("year")}-${get("month")}-${get("day")}`;
    const hms = `${get("hour")}:${get("minute")}:${get("second")}`;
    const offset = obterOffsetIso(instante, fuso);

    return `${ymd}T${hms}${offset}`;
}

export function datasHorasIguais(a: string, b: string): boolean {
    const ta = Date.parse(a);
    const tb = Date.parse(b);

    if (Number.isNaN(ta) || Number.isNaN(tb)) {
        return normalizarDataHoraIso(a) === normalizarDataHoraIso(b);
    }

    return ta === tb;
}

export function diaSeguinte(data: string): string {
    const proximoDia = new Date(`${data}T12:00:00`);
    proximoDia.setDate(proximoDia.getDate() + 1);
    return dataNoFuso(proximoDia);
}
