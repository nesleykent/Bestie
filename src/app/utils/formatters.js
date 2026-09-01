export function formatNumber(value) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function formatTime(minutes) {
    if (!Number.isFinite(minutes)) {
        return "\u221e";
    }

    if (minutes <= 0) {
        return "0 min";
    }

    if (minutes < 1) {
        return `${Math.max(1, Math.round(minutes * 60))} sec`;
    }

    if (minutes < 60) {
        return `${minutes.toFixed(1)} min`;
    }

    return `${(minutes / 60).toFixed(1)} h`;
}

export function formatTimeDetailed(minutes) {
    if (!Number.isFinite(minutes)) {
        return "\u221e";
    }

    if (minutes <= 0) {
        return "0 min";
    }

    const roundedMinutes = Math.round(minutes);
    const hours = Math.floor(roundedMinutes / 60);
    const remainingMinutes = roundedMinutes % 60;

    if (hours === 0) {
        return `${remainingMinutes} min`;
    }

    if (remainingMinutes === 0) {
        return `${hours}h`;
    }

    return `${hours}h ${remainingMinutes}min`;
}

export function formatKillRate(killsPerMinute) {
    const killsPerHour = killsPerMinute * 60;
    return `${killsPerHour.toFixed(1)} kills/h`;
}

export function formatTaskRate(killsPerHour) {
    if (!Number.isFinite(killsPerHour) || killsPerHour <= 0) {
        return "~0/h";
    }

    return `~${Math.round(killsPerHour)}/h`;
}

export function formatCharmsPerHour(charmsPerHour) {
    if (!Number.isFinite(charmsPerHour)) {
        return "\u221e";
    }

    return `${charmsPerHour.toFixed(2)} charm points/h`;
}
