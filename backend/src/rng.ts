// No I/O/O0/1/L to avoid ambiguity in spoken/typed lobby codes.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function lobbyCode(len = 4): string {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    let s = "";
    for (let i = 0; i < len; i++) s += ALPHABET[bytes[i]! % ALPHABET.length];
    return s;
}

export function uuid(): string {
    return crypto.randomUUID();
}

export function sessionToken(): string {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}
