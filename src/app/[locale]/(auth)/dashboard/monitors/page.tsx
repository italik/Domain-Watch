import { auth } from '@clerk/nextjs/server';
import { desc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TitleBar } from '@/features/dashboard/TitleBar';
import {
  checkAllMonitorsAction,
  checkMonitorAction,
  createMonitorAction,
  deleteMonitorAction,
  pauseMonitorsAction,
} from '@/features/dns/actions';
import { db } from '@/libs/DB';
import {
  dnsChangeEventSchema,
  dnsMonitorSchema,
  dnsRecordTypes,
} from '@/models/Schema';
import { getI18nPath } from '@/utils/Helpers';

export async function generateMetadata(props: { params: { locale: string } }) {
  const t = await getTranslations({
    locale: props.params.locale,
    namespace: 'DnsMonitors',
  });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

const formatDate = (locale: string, date?: Date | null) => {
  if (!date) {
    return '—';
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const DnsMonitorsPage = async (props: { params: { locale: string } }) => {
  const { orgId } = await auth();
  const locale = props.params.locale;

  if (!orgId) {
    redirect(getI18nPath('/onboarding/organization-selection', locale));
  }

  const t = await getTranslations({
    locale,
    namespace: 'DnsMonitors',
  });

  const monitors = await db.query.dnsMonitorSchema.findMany({
    where: (table, { eq }) => eq(table.organizationId, orgId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  const monitorIds = monitors.map(monitor => monitor.id);
  const snapshots = monitorIds.length
    ? await db.query.dnsRecordSnapshotSchema.findMany({
      where: (table, { inArray }) => inArray(table.monitorId, monitorIds),
      orderBy: (table, { desc }) => [desc(table.fetchedAt)],
    })
    : [];

  const snapshotByMonitor = new Map<number, typeof snapshots[number]>();
  for (const snapshot of snapshots) {
    if (!snapshotByMonitor.has(snapshot.monitorId)) {
      snapshotByMonitor.set(snapshot.monitorId, snapshot);
    }
  }

  const changes = monitorIds.length
    ? await db
      .select({
        id: dnsChangeEventSchema.id,
        detectedAt: dnsChangeEventSchema.detectedAt,
        changeSummary: dnsChangeEventSchema.changeSummary,
        domain: dnsMonitorSchema.domain,
        recordType: dnsMonitorSchema.recordType,
      })
      .from(dnsChangeEventSchema)
      .innerJoin(
        dnsMonitorSchema,
        eq(dnsChangeEventSchema.monitorId, dnsMonitorSchema.id),
      )
      .where(eq(dnsMonitorSchema.organizationId, orgId))
      .orderBy(desc(dnsChangeEventSchema.detectedAt))
      .limit(10)
    : [];

  return (
    <div className="space-y-8">
      <TitleBar
        title={t('title_bar')}
        description={t('title_bar_description')}
      />

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('new_monitor_title')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('new_monitor_description')}
            </p>
          </div>
          <form
            action={checkAllMonitorsAction.bind(null, locale)}
            className="flex items-center"
          >
            <Button type="submit" variant="secondary">
              {t('check_all')}
            </Button>
          </form>
        </div>
        <form
          action={createMonitorAction.bind(null, locale)}
          className="mt-6 grid gap-4 md:grid-cols-[1.5fr_1fr_auto] md:items-end"
        >
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="domain">
              {t('domain_label')}
            </label>
            <Input
              id="domain"
              name="domain"
              placeholder="example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="recordType">
              {t('record_type_label')}
            </label>
            <select
              id="recordType"
              name="recordType"
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              defaultValue={dnsRecordTypes[0]}
            >
              {dnsRecordTypes.map(type => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" className="w-full md:w-auto">
            {t('create_monitor')}
          </Button>
        </form>
      </div>

      <div className="rounded-lg border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table_domain')}</TableHead>
              <TableHead>{t('table_type')}</TableHead>
              <TableHead>{t('table_status')}</TableHead>
              <TableHead>{t('table_last_checked')}</TableHead>
              <TableHead>{t('table_last_change')}</TableHead>
              <TableHead>{t('table_records')}</TableHead>
              <TableHead className="text-right">{t('table_actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {monitors.length === 0
              ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm">
                      {t('empty_state')}
                    </TableCell>
                  </TableRow>
                )
              : (
                  monitors.map((monitor) => {
                    const snapshot = snapshotByMonitor.get(monitor.id);
                    const records = (snapshot?.records as string[] | undefined) ?? [];

                    return (
                      <TableRow key={monitor.id}>
                        <TableCell className="font-medium">{monitor.domain}</TableCell>
                        <TableCell>{monitor.recordType}</TableCell>
                        <TableCell>
                          <Badge
                            variant={monitor.status === 'active' ? 'default' : 'secondary'}
                          >
                            {monitor.status === 'active'
                              ? t('status_active')
                              : t('status_paused')}
                          </Badge>
                          {monitor.lastError && (
                            <p className="mt-2 text-xs text-destructive">
                              {monitor.lastError}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>{formatDate(locale, monitor.lastCheckedAt)}</TableCell>
                        <TableCell>{formatDate(locale, monitor.lastChangeAt)}</TableCell>
                        <TableCell className="max-w-[260px]">
                          {records.length === 0
                            ? (
                                <span className="text-sm text-muted-foreground">
                                  {t('no_records')}
                                </span>
                              )
                            : (
                                <div className="space-y-1 text-sm">
                                  {records.slice(0, 3).map(record => (
                                    <div key={record} className="truncate">
                                      {record}
                                    </div>
                                  ))}
                                  {records.length > 3 && (
                                    <div className="text-xs text-muted-foreground">
                                      {t('more_records', { count: records.length - 3 })}
                                    </div>
                                  )}
                                </div>
                              )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <form
                              action={checkMonitorAction.bind(
                                null,
                                locale,
                                monitor.id,
                              )}
                            >
                              <Button type="submit" size="sm" variant="outline">
                                {t('check_now')}
                              </Button>
                            </form>
                            <form
                              action={pauseMonitorsAction.bind(
                                null,
                                locale,
                                [monitor.id],
                                monitor.status === 'active' ? 'paused' : 'active',
                              )}
                            >
                              <Button type="submit" size="sm" variant="secondary">
                                {monitor.status === 'active'
                                  ? t('pause')
                                  : t('resume')}
                              </Button>
                            </form>
                            <form
                              action={deleteMonitorAction.bind(null, locale, monitor.id)}
                            >
                              <Button type="submit" size="sm" variant="destructive">
                                {t('delete')}
                              </Button>
                            </form>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{t('changes_title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('changes_description')}
        </p>
        <div className="mt-4 space-y-3">
          {changes.length === 0
            ? (
                <p className="text-sm text-muted-foreground">{t('no_changes')}</p>
              )
            : (
                changes.map(change => (
                  <div
                    key={change.id}
                    className="rounded-md border border-border/60 bg-muted/50 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span>{change.domain}</span>
                      <Badge variant="outline">{change.recordType}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(locale, change.detectedAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {change.changeSummary}
                    </p>
                  </div>
                ))
              )}
        </div>
      </div>
    </div>
  );
};

export const dynamic = 'force-dynamic';

export default DnsMonitorsPage;
