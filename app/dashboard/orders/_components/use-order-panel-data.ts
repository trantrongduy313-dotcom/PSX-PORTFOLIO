"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchOrderDetail } from "@/app/lib/api/order-panel";
import { configuredCalendarToWorkingCalendar } from "@/app/lib/business/kpi-3d/calendar-adapter";
import { hasCapability } from "@/app/lib/business/kpi-3d/permissions";
import type { OrderDetail, OrderSummary } from "@/app/lib/types/order";

import type { Designer3DWorkloadRow } from "./panel-designer-3d";

export type Kpi3DGroupOption = {
  id: string;
  code: string;
  name: string;
  standardMinutes: number;
  isActive: boolean;
};

export type Kpi3DCalendarOption = {
  id: string;
  isDefault: boolean;
  isActive: boolean;
  sessions: Array<{
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
    isActive: boolean;
  }>;
  holidays: Array<{ date: string | Date }>;
};

type Craftsman = { id: string; name: string; level: string; khau: string };
type Designer3D = { id: string; name: string; code: string };
type StoreOption = { id: string; code: string; name: string };

const CATALOG_QUERY = { staleTime: 60 * 60_000, gcTime: 24 * 60 * 60_000 } as const;
const KPI_CONFIG_QUERY = { staleTime: 5 * 60_000, gcTime: 60 * 60_000 } as const;

async function getJson<T>(url: string, whatFailed: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Cannot load ${whatFailed}`);
  return res.json();
}

type Params = {
  orderId: string | null;
  isPendingCreate: boolean;
  placeholderData?: OrderSummary | null;
  currentUserRole?: string | null;
};

export function useOrderPanelData({ orderId, isPendingCreate, placeholderData, currentUserRole }: Params) {
  const orderQuery = useQuery<OrderDetail>({
    queryKey: ["order-panel", orderId],
    queryFn: () => fetchOrderDetail(orderId!),
    enabled: !!orderId && !isPendingCreate,
    // ⚠️ `staleTime` PHẢI KHỚP nhịp refetch — lệch thì refetch-on-focus bị vô hiệu và sidebar
    // đóng băng. Bài học khoá ở __tests__/order-panel-query-config.test.ts.
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    placeholderData: placeholderData
      ? ({
          ...placeholderData,
          _count: { ...placeholderData._count, versions: 0 },
          items: [], alerts: [], workflowHistory: [], referenceUrls: [],
          productionDetail: null, finalTotal: null, currency: "VND",
          designBriefUrl: null, productionNote: null,
        } as unknown as OrderDetail)
      : undefined,
  });

  const { data: craftsmenData } = useQuery<{ data: Craftsman[] }>({
    queryKey: ["craftsmen"],
    queryFn: () => getJson("/api/craftsmen", "craftsmen"),
    ...CATALOG_QUERY,
  });

  const { data: designers3DData } = useQuery<{ data: Designer3D[] }>({
    queryKey: ["designers-3d"],
    queryFn: () => getJson("/api/designers-3d", "designers 3D"),
    ...CATALOG_QUERY,
  });

  // Chỉ ADMIN/ORDER gọi (khớp năng lực READ_WORKLOAD ở server) — vai khác gọi sẽ nhận 403.
  const canReadWorkload = currentUserRole === "ADMIN" || currentUserRole === "ORDER";
  const canViewOvertimeRecord = hasCapability("VIEW_OVERTIME_RECORD", currentUserRole ?? undefined);
  const canReadKpi3DConfig = ["ADMIN", "ORDER", "PRODUCTION", "DESIGN_3D"].includes(currentUserRole ?? "");
  const canEditSoMeta = currentUserRole === "ADMIN" || currentUserRole === "ORDER";

  // Query RIÊNG, không ghép vào "designers-3d": query đó cache 1 TIẾNG, còn số việc đang làm mà
  // cũ 1 tiếng thì tệ hơn không hiện gì — nó trông như số thật.
  const { data: workloadData } = useQuery<{ data: Designer3DWorkloadRow[] }>({
    queryKey: ["designers-3d-workload"],
    enabled: canReadWorkload,
    queryFn: () => getJson("/api/designers-3d/workload", "3D workload"),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const { data: kpi3DGroupsData } = useQuery<{ data: Kpi3DGroupOption[] }>({
    queryKey: ["kpi-3d-groups", "active"],
    queryFn: () => getJson("/api/admin/kpi-3d/groups", "KPI 3D groups"),
    enabled: canReadKpi3DConfig,
    ...KPI_CONFIG_QUERY,
  });

  const { data: kpi3DCalendarsData } = useQuery<{ data: Kpi3DCalendarOption[] }>({
    queryKey: ["kpi-3d-working-calendars", "active"],
    queryFn: () => getJson("/api/admin/kpi-3d/working-calendars", "KPI 3D working calendars"),
    enabled: canReadKpi3DConfig,
    ...KPI_CONFIG_QUERY,
  });

  const { data: storesData } = useQuery<{ data: StoreOption[] }>({
    queryKey: ["stores"],
    queryFn: () => getJson("/api/stores", "stores"),
    ...CATALOG_QUERY,
  });

  // Khoá theo TÊN: dữ liệu giao việc lưu tên NV 3D (perItem[].tho3d), không lưu id.
  const workloadByName = useMemo(() => {
    const byName = new Map<string, Designer3DWorkloadRow>();
    for (const row of workloadData?.data ?? []) byName.set(row.name, row);
    return byName;
  }, [workloadData]);

  const kpi3DGroups = useMemo(
    () => (kpi3DGroupsData?.data ?? []).filter((group) => group.isActive),
    [kpi3DGroupsData?.data],
  );

  const defaultKpi3DCalendar = useMemo(() => {
    const calendars = kpi3DCalendarsData?.data ?? [];
    return (
      calendars.find((calendar) => calendar.isActive && calendar.isDefault) ??
      calendars.find((calendar) => calendar.isActive) ??
      null
    );
  }, [kpi3DCalendarsData?.data]);

  const kpi3DWorkingCalendar = useMemo(
    () => (defaultKpi3DCalendar ? configuredCalendarToWorkingCalendar(defaultKpi3DCalendar) : undefined),
    [defaultKpi3DCalendar],
  );

  return {
    order: orderQuery.data,
    isLoading: orderQuery.isLoading,
    isError: orderQuery.isError,
    isPlaceholderData: orderQuery.isPlaceholderData,
    refetch: orderQuery.refetch,

    craftsmen: craftsmenData?.data ?? [],
    designers3D: designers3DData?.data ?? [],
    storeOptions: storesData?.data ?? [],
    workloadByName,
    kpi3DGroups,
    defaultKpi3DCalendar,
    kpi3DWorkingCalendar,

    canViewOvertimeRecord,
    canReadKpi3DConfig,
    canEditSoMeta,
  };
}
