// SPDX-FileCopyrightText: 2026 Mark (malfunctionAI) / KoodiKiht
// SPDX-License-Identifier: MIT

import type { AuditFinding, NetworkEntry } from "./types.ts";

const KNOWN_TRACKER_PATTERNS = [
  /google-analytics\.com$/i,
  /googletagmanager\.com$/i,
  /doubleclick\.net$/i,
  /connect\.facebook\.net$/i,
  /analytics\.tiktok\.com$/i,
  /mc\.yandex\.ru$/i,
  /hotjar\.com$/i,
  /clarity\.ms$/i,
  /mixpanel\.com$/i,
  /segment\.io$/i,
  /fullstory\.com$/i,
];

function extractRegistrableDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split(".");
  if (parts.length <= 2) return hostname.toLowerCase();
  return parts.slice(-2).join(".");
}

export function inspectNetworkPrivacy(
  pageUrl: string,
  entries: NetworkEntry[],
): {
  thirdPartyHosts: string[];
  findings: AuditFinding[];
} {
  const findings: AuditFinding[] = [];
  const thirdPartySet = new Set<string>();
  const flaggedTrackers = new Set<string>();

  let baseDomain = "";
  try {
    baseDomain = extractRegistrableDomain(new URL(pageUrl).hostname);
  } catch {
    baseDomain = "";
  }

  let mainDocChecked = false;

  for (const entry of entries) {
    let parsed: URL;
    try {
      parsed = new URL(entry.url);
    } catch {
      continue;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:" && parsed.protocol !== "wss:") {
      continue;
    }

    const host = parsed.hostname.toLowerCase();
    const regDomain = extractRegistrableDomain(host);

    if (!mainDocChecked && (entry.resourceType === "Document" || entry.url === pageUrl)) {
      mainDocChecked = true;
      const headers = entry.responseHeaders ?? {};
      const headerKeys = Object.keys(headers).reduce<Record<string, string>>((acc, k) => {
        acc[k.toLowerCase()] = headers[k];
        return acc;
      }, {});

      const csp = headerKeys["content-security-policy"];
      if (!csp) {
        findings.push({
          ruleId: "PRIV-001-MISSING-CSP",
          category: "privacy",
          severity: "MEDIUM",
          message: "Document response lacks a Content-Security-Policy header restricting third-party script or connect origins",
          targetUrl: entry.url,
        });
      } else if (csp.includes("'unsafe-eval'") || csp.includes("'unsafe-inline'")) {
        findings.push({
          ruleId: "PRIV-002-WEAK-CSP",
          category: "privacy",
          severity: "LOW",
          message: "Content-Security-Policy permits 'unsafe-inline' or 'unsafe-eval' execution",
          targetUrl: entry.url,
        });
      }
    }

    if (baseDomain && regDomain !== baseDomain) {
      thirdPartySet.add(host);

      if (
        !flaggedTrackers.has(host) &&
        KNOWN_TRACKER_PATTERNS.some((re) => re.test(host))
      ) {
        flaggedTrackers.add(host);
        findings.push({
          ruleId: "PRIV-003-PRECONSENT-TRACKER",
          category: "privacy",
          severity: "HIGH",
          message: `Third-party telemetry or tracking endpoint contacted during initial page load without prior user interaction: ${host}`,
          targetUrl: entry.url,
        });
      }
    }
  }

  return {
    thirdPartyHosts: Array.from(thirdPartySet).sort(),
    findings,
  };
}
