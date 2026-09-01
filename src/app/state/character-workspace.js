import { createWorkspace, restoreWorkspace } from "./hunt-workspace.js";

let characterSequence = 0;

function nextCharacterId() {
    characterSequence += 1;
    return `character-${characterSequence}`;
}

export function createCharacter(name = "") {
    return {
        id: nextCharacterId(),
        name,
        workspace: createWorkspace()
    };
}

export function createDefaultCharacter() {
    return createCharacter("");
}

/**
 * Wraps an already-restored (normalized) single-character workspace — the
 * shape hunt-workspace.js's own restoreWorkspace() returns — as the first
 * character during one-time migration off the pre-multi-character save.
 * Deliberately does not go through createCharacter()/createWorkspace(), which
 * would mint and discard an unused hunt id for nothing.
 */
export function wrapLegacyWorkspaceAsCharacter(workspace) {
    return {
        id: nextCharacterId(),
        name: "",
        workspace
    };
}

/**
 * A character's display label. A user-supplied name wins; otherwise the label is
 * positional, mirroring getHuntLabel in hunt-workspace.js.
 */
export function getCharacterLabel(index, character) {
    const name = typeof character?.name === "string" ? character.name.trim() : "";

    return name || `Character ${index + 1}`;
}

export function addCharacter(characters, name = "") {
    const character = createCharacter(name);

    return {
        character,
        characters: [...characters, character]
    };
}

export function removeCharacter(characters, characterId, activeCharacterId) {
    const removedIndex = characters.findIndex((character) => character.id === characterId);

    if (characters.length < 2 || removedIndex === -1) {
        return { characters, activeCharacterId };
    }

    const remainingCharacters = characters.filter((character) => character.id !== characterId);

    if (characterId !== activeCharacterId) {
        return { characters: remainingCharacters, activeCharacterId };
    }

    const nextIndex = Math.min(removedIndex, remainingCharacters.length - 1);

    return {
        characters: remainingCharacters,
        activeCharacterId: remainingCharacters[nextIndex].id
    };
}

function adoptSavedCharacterId(savedId, generatedId, adoptedIds) {
    const trimmedSavedId = typeof savedId === "string" ? savedId.trim() : "";
    const id = trimmedSavedId && !adoptedIds.has(trimmedSavedId) ? trimmedSavedId : generatedId;

    adoptedIds.add(id);

    return id;
}

/**
 * Restoring a character runs its saved workspace through hunt-workspace's own
 * restoreWorkspace. A malformed or empty workspace falls back to a fresh one
 * rather than failing, so one bad character in an imported file cannot sink
 * the whole import.
 */
function restoreCharacter(savedCharacter, adoptedIds) {
    const character = createCharacter();

    return {
        id: adoptSavedCharacterId(savedCharacter?.id, character.id, adoptedIds),
        name: typeof savedCharacter?.name === "string" ? savedCharacter.name : "",
        workspace: restoreWorkspace(savedCharacter?.workspace) || character.workspace
    };
}

function reserveSavedCharacterIds(savedCharacters) {
    savedCharacters.forEach((savedCharacter) => {
        const savedSequence = Number.parseInt(String(savedCharacter?.id).replace("character-", ""), 10);

        if (Number.isFinite(savedSequence) && savedSequence > characterSequence) {
            characterSequence = savedSequence;
        }
    });
}

/**
 * Every character is restored eagerly, not lazily on first switch. Hunt ids are
 * adopted by a module-level sequence in hunt-workspace.js that only ever
 * increases; if a character were left unrestored until switched to, its hunt
 * ids would not yet have raised that sequence, and a hunt created meanwhile in
 * another character could later collide with one still waiting inside it.
 */
export function restoreAppWorkspace(savedState) {
    const savedCharacters = Array.isArray(savedState?.characters) ? savedState.characters : [];

    if (!savedCharacters.length) {
        return null;
    }

    reserveSavedCharacterIds(savedCharacters);

    const adoptedIds = new Set();
    const characters = savedCharacters.map((savedCharacter) => restoreCharacter(savedCharacter, adoptedIds));
    const savedActiveIndex = savedCharacters.findIndex((character) => character?.id === savedState?.activeCharacterId);

    return {
        characters,
        activeCharacterId: characters[savedActiveIndex === -1 ? 0 : savedActiveIndex].id
    };
}
