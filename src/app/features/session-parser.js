export function extractSessionDuration(logText) {
    const match = logText.match(/Session:\s*(\d+):(\d+)h/i);
    return match ? (Number.parseInt(match[1], 10) * 60) + Number.parseInt(match[2], 10) : 0;
}

export function extractKilledMonsters(logText) {
    const killedMonsters = {};
    let capturing = false;

    logText.split("\n").forEach((line) => {
        if (line.includes("Killed Monsters:")) {
            capturing = true;
            return;
        }

        if (line.includes("Looted Items:")) {
            capturing = false;
        }

        if (!capturing) {
            return;
        }

        const match = line.match(/\s*(\d+)x\s+(.+)/);
        if (!match) {
            return;
        }

        const count = Number.parseInt(match[1], 10);
        const name = match[2].trim().toLowerCase();
        killedMonsters[name] = (killedMonsters[name] || 0) + count;
    });

    return killedMonsters;
}
