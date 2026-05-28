export async function renderJoinBanner(el: HTMLElement) {
    let joinUrl: string;
    let note = "";

    try {
        const res = await fetch("/lan-info");
        const data = (await res.json()) as { ip: string | null };
        if (data.ip) {
            joinUrl = `${location.protocol}//${data.ip}:${location.port || "80"}`;
        } else {
            joinUrl = `${location.protocol}//${location.host}`;
            if (
                location.hostname === "localhost" ||
                location.hostname === "127.0.0.1"
            ) {
                note = "set HOST_LAN_IP before compose up to share over LAN";
            }
        }
    } catch {
        joinUrl = `${location.protocol}//${location.host}`;
    }

    el.innerHTML = `
        <div class="join-label">Join URL</div>
        <a class="join-url" href="${joinUrl}" target="_blank" rel="noopener">${joinUrl}</a>
        <button class="join-copy" type="button">Copy</button>
        ${note ? `<div class="join-note">${note}</div>` : ""}
    `;

    el.querySelector<HTMLButtonElement>(".join-copy")!.addEventListener(
        "click",
        async () => {
            await navigator.clipboard.writeText(joinUrl);
            const btn = el.querySelector<HTMLButtonElement>(".join-copy")!;
            const prev = btn.textContent;
            btn.textContent = "Copied";
            setTimeout(() => {
                btn.textContent = prev;
            }, 1200);
        },
    );
}
