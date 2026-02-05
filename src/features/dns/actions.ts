'use server';

import { auth } from '@clerk/nextjs/server';
import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { db } from '@/libs/DB';
import { buildChangeSummary, resolveDnsRecords } from '@/libs/dns';
import {
  dnsChangeEventSchema,
  dnsMonitorSchema,
  dnsRecordSnapshotSchema,
  dnsRecordTypes,
} from '@/models/Schema';
import { getI18nPath } from '@/utils/Helpers';

const createMonitorSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(3)
    .max(253)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'Enter a valid domain name'),
  recordType: z.enum(dnsRecordTypes),
});

const monitorIdSchema = z.number().int().positive();

const getOrgContext = async () => {
  const { userId, orgId } = await auth();

  if (!userId) {
    throw new Error('Authentication required.');
  }

  if (!orgId) {
    throw new Error('Organization required.');
  }

  return { userId, orgId };
};

const revalidateMonitors = (locale: string) => {
  const path = getI18nPath('/dashboard/monitors', locale);
  revalidatePath(path);
};

export const createMonitorAction = async (
  locale: string,
  formData: FormData,
) => {
  const { userId, orgId } = await getOrgContext();

  const parsed = createMonitorSchema.safeParse({
    domain: formData.get('domain'),
    recordType: formData.get('recordType'),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? 'Invalid input');
  }

  const domain = parsed.data.domain.toLowerCase();

  await db.insert(dnsMonitorSchema).values({
    organizationId: orgId,
    createdBy: userId,
    domain,
    recordType: parsed.data.recordType,
  });

  revalidateMonitors(locale);
};

export const deleteMonitorAction = async (locale: string, monitorId: number) => {
  const { orgId } = await getOrgContext();
  const parsedId = monitorIdSchema.safeParse(monitorId);

  if (!parsedId.success) {
    throw new Error('Invalid monitor ID.');
  }

  await db
    .delete(dnsMonitorSchema)
    .where(
      and(
        eq(dnsMonitorSchema.id, parsedId.data),
        eq(dnsMonitorSchema.organizationId, orgId),
      ),
    );

  revalidateMonitors(locale);
};

const fetchMonitor = async (monitorId: number, orgId: string) => {
  const monitor = await db.query.dnsMonitorSchema.findFirst({
    where: (table, { eq }) =>
      and(eq(table.id, monitorId), eq(table.organizationId, orgId)),
  });

  if (!monitor) {
    throw new Error('Monitor not found.');
  }

  return monitor;
};

export const checkMonitorAction = async (locale: string, monitorId: number) => {
  const { orgId } = await getOrgContext();
  const parsedId = monitorIdSchema.safeParse(monitorId);

  if (!parsedId.success) {
    throw new Error('Invalid monitor ID.');
  }

  const monitor = await fetchMonitor(parsedId.data, orgId);

  try {
    const records = await resolveDnsRecords(monitor.domain, monitor.recordType);
    const previousSnapshot = await db.query.dnsRecordSnapshotSchema.findFirst({
      where: (table, { eq }) => eq(table.monitorId, monitor.id),
      orderBy: (table, { desc }) => [desc(table.fetchedAt)],
    });

    await db.insert(dnsRecordSnapshotSchema).values({
      monitorId: monitor.id,
      records,
    });

    const previousRecords
      = (previousSnapshot?.records as string[] | undefined) ?? null;

    const hasChanges
      = !previousRecords
      || JSON.stringify(previousRecords) !== JSON.stringify(records);

    if (hasChanges) {
      await db.insert(dnsChangeEventSchema).values({
        monitorId: monitor.id,
        previousRecords,
        currentRecords: records,
        changeSummary: buildChangeSummary(previousRecords, records),
      });

      await db
        .update(dnsMonitorSchema)
        .set({
          lastChangeAt: new Date(),
        })
        .where(eq(dnsMonitorSchema.id, monitor.id));
    }

    await db
      .update(dnsMonitorSchema)
      .set({
        lastCheckedAt: new Date(),
        lastError: null,
      })
      .where(eq(dnsMonitorSchema.id, monitor.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    await db
      .update(dnsMonitorSchema)
      .set({
        lastCheckedAt: new Date(),
        lastError: message,
      })
      .where(eq(dnsMonitorSchema.id, monitor.id));
  }

  revalidateMonitors(locale);
};

export const checkAllMonitorsAction = async (locale: string) => {
  const { orgId } = await getOrgContext();

  const monitors = await db.query.dnsMonitorSchema.findMany({
    where: (table, { eq }) => eq(table.organizationId, orgId),
  });

  for (const monitor of monitors.filter(item => item.status === 'active')) {
    await checkMonitorAction(locale, monitor.id);
  }

  revalidateMonitors(locale);
};

export const pauseMonitorsAction = async (
  locale: string,
  monitorIds: number[],
  status: 'active' | 'paused',
) => {
  const { orgId } = await getOrgContext();
  if (status !== 'active' && status !== 'paused') {
    throw new Error('Invalid status.');
  }
  const validatedIds = monitorIds
    .map(id => monitorIdSchema.safeParse(id))
    .filter(result => result.success)
    .map(result => result.data);

  if (validatedIds.length === 0) {
    throw new Error('No valid monitors selected.');
  }

  await db
    .update(dnsMonitorSchema)
    .set({ status })
    .where(
      and(
        eq(dnsMonitorSchema.organizationId, orgId),
        inArray(dnsMonitorSchema.id, validatedIds),
      ),
    );

  revalidateMonitors(locale);
};
