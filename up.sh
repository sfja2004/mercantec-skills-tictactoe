#!/usr/bin/env bash
# Start the tictactoe stack with HOST_LAN_IP auto-detected so the in-app
# join banner shows the correct shareable URL for the current network.
#
# Usage: ./up.sh [extra args passed to docker compose up]

set -euo pipefail

detect_lan_ip() {
    # macOS: walk common wifi/ethernet interfaces
    if command -v ipconfig >/dev/null 2>&1 && ipconfig getifaddr en0 >/dev/null 2>&1; then
        for iface in en0 en1 en2 en3; do
            ip=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
            if [ -n "${ip:-}" ]; then
                echo "$ip"
                return
            fi
        done
    fi

    # Linux: ask the kernel which src IP it would use for an outbound packet
    if command -v ip >/dev/null 2>&1; then
        ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')
        if [ -n "${ip:-}" ]; then
            echo "$ip"
            return
        fi
    fi

    # Last resort
    if command -v hostname >/dev/null 2>&1; then
        hostname -I 2>/dev/null | awk '{print $1}'
    fi
}

HOST_LAN_IP=$(detect_lan_ip || true)

if [ -z "${HOST_LAN_IP:-}" ]; then
    echo "warning: could not auto-detect LAN IP - banner will fall back to location.host" >&2
else
    echo "HOST_LAN_IP=$HOST_LAN_IP"
fi

export HOST_LAN_IP
exec docker compose up -d "$@"
