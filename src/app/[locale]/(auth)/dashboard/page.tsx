import { auth } from '@clerk/nextjs/server';
import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { db } from '@/libs/DB';
import { dnsChangeEventSchema, dnsMonitorSchema } from '@/models/Schema';
import { getI18nPath } from '@/utils/Helpers';

const formatDate = (locale: string, date?: Date | null) => {
  if (!date) {
    return '—';
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const DashboardIndexPage = async (props: { params: { locale: string } }) => {
  const { orgId } = await auth();
  const locale = props.params.locale;

  if (!orgId) {
    redirect(getI18nPath('/onboarding/organization-selection', locale));
  }

  const t = await getTranslations({
    locale,
    namespace: 'DashboardIndex',
  });

  const monitors = await db.query.dnsMonitorSchema.findMany({
    where: (table, { eq }) => eq(table.organizationId, orgId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  const recentChanges = monitors.length
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
      .limit(5)
    : [];

  const activeMonitors = monitors.filter(
    monitor => monitor.status === 'active',
  ).length;
  const lastChecked = monitors
    .map(monitor => monitor.lastCheckedAt)
    .filter(Boolean)
    .sort((a, b) => (b?.getTime() ?? 0) - (a?.getTime() ?? 0))[0];

  return (
    <div className="space-y-8">
      <TitleBar
        title={t('title_bar')}
        description={t('title_bar_description')}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">{t('stat_total')}</p>
          <p className="text-2xl font-semibold">{monitors.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">{t('stat_active')}</p>
          <p className="text-2xl font-semibold">{activeMonitors}</p>
        </div>
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">{t('stat_last_check')}</p>
          <p className="text-2xl font-semibold">
            {formatDate(locale, lastChecked)}
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('cta_title')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('cta_description')}
            </p>
          </div>
          <Button asChild>
            <Link href={getI18nPath('/dashboard/monitors', locale)}>
              {t('cta_button')}
            </Link>
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{t('recent_changes_title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('recent_changes_description')}
        </p>
        <div className="mt-4 space-y-3">
          {recentChanges.length === 0
            ? (
                <p className="text-sm text-muted-foreground">
                  {t('recent_changes_empty')}
                </p>
              )
            : (
                recentChanges.map(change => (
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

export default DashboardIndexPage;
