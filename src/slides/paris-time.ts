// Retourne l'heure de Paris (HH:MM) sans dépendre du support Intl du device.
// Certains Android TV embarquent un ICU restreint où `toLocaleTimeString(...,
// { timeZone: 'Europe/Paris' })` retombe silencieusement sur UTC. On calcule
// manuellement l'offset CET (+1) / CEST (+2) selon les règles DST européennes.
//
// DST Europe : passage à +2 le dernier dimanche de mars à 01:00 UTC,
//              retour à +1 le dernier dimanche d'octobre à 01:00 UTC.
export function formatParisTime(now: Date): string {
    const offsetHours = isEuropeanDst(now) ? 2 : 1;
    const paris = new Date(now.getTime() + offsetHours * 3600 * 1000);
    const hh = String(paris.getUTCHours()).padStart(2, '0');
    const mm = String(paris.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

function isEuropeanDst(date: Date): boolean {
    const year = date.getUTCFullYear();
    const dstStart = lastSundayAt01UTC(year, 2);  // mars
    const dstEnd = lastSundayAt01UTC(year, 9);    // octobre
    return date >= dstStart && date < dstEnd;
}

function lastSundayAt01UTC(year: number, month: number): Date {
    // Dernier jour du mois (month+1, day 0 = dernier jour du mois précédent).
    const d = new Date(Date.UTC(year, month + 1, 0));
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    d.setUTCHours(1, 0, 0, 0);
    return d;
}
