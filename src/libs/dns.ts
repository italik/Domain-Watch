import 'server-only';

import {
  resolve4,
  resolve6,
  resolveCaa,
  resolveCname,
  resolveMx,
  resolveNs,
  resolveSoa,
  resolveTxt,
} from 'node:dns/promises';

import type { dnsRecordTypes } from '@/models/Schema';

export type DnsRecordType = (typeof dnsRecordTypes)[number];

const uniqueSorted = (records: string[]) =>
  Array.from(new Set(records.map(record => record.trim()).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b),
  );

const formatTxt = (records: string[][]) =>
  records.map(segments => segments.join('')).filter(Boolean);

export const resolveDnsRecords = async (
  domain: string,
  recordType: DnsRecordType,
): Promise<string[]> => {
  switch (recordType) {
    case 'A': {
      return uniqueSorted(await resolve4(domain));
    }
    case 'AAAA': {
      return uniqueSorted(await resolve6(domain));
    }
    case 'CNAME': {
      return uniqueSorted(await resolveCname(domain));
    }
    case 'MX': {
      const records = await resolveMx(domain);
      return uniqueSorted(
        records.map(record => `${record.priority} ${record.exchange}`),
      );
    }
    case 'TXT': {
      const records = await resolveTxt(domain);
      return uniqueSorted(formatTxt(records));
    }
    case 'NS': {
      return uniqueSorted(await resolveNs(domain));
    }
    case 'SOA': {
      const record = await resolveSoa(domain);
      return uniqueSorted([
        `${record.nsname} ${record.hostmaster} ${record.serial} ${record.refresh} ${record.retry} ${record.expire} ${record.minttl}`,
      ]);
    }
    case 'CAA': {
      const records = await resolveCaa(domain);
      return uniqueSorted(
        records.map((record) => {
          if (record.issue) {
            return `${record.critical ? 1 : 0} issue ${record.issue}`;
          }
          if (record.issuewild) {
            return `${record.critical ? 1 : 0} issuewild ${record.issuewild}`;
          }
          if (record.iodef) {
            return `${record.critical ? 1 : 0} iodef ${record.iodef}`;
          }
          return `${record.critical ? 1 : 0} unknown`;
        }),
      );
    }
    default: {
      throw new Error(`Unsupported record type: ${recordType}`);
    }
  }
};

export const buildChangeSummary = (
  previousRecords: string[] | null,
  currentRecords: string[],
) => {
  if (!previousRecords || previousRecords.length === 0) {
    return 'Initial snapshot captured.';
  }

  const previousSet = new Set(previousRecords);
  const currentSet = new Set(currentRecords);
  const added = currentRecords.filter(record => !previousSet.has(record));
  const removed = previousRecords.filter(record => !currentSet.has(record));

  if (added.length === 0 && removed.length === 0) {
    return 'No changes detected.';
  }

  const parts = [];
  if (added.length > 0) {
    parts.push(`Added: ${added.join(', ')}`);
  }
  if (removed.length > 0) {
    parts.push(`Removed: ${removed.join(', ')}`);
  }
  return parts.join(' | ');
};
