"use client";

import { formatDate, cn } from "@/app/lib/utils";
import type { ProductionDetail } from "@/app/lib/types/order";
import { STAGE_DEFS } from "@/app/lib/utils/order-helpers";
import { CheckCircle2, Circle, Clock, XCircle, AlertCircle, User, Truck } from "lucide-react";

type StageDisplay = {
  code: string;
  label: string;
  stageStatus: "pending" | "doing" | "qc" | "done" | "cancelled" | "hold";
  startAt: string | null;
  doneAt: string | null;
  crafter: string | null;
};

// Build display list from STAGE_DEFS — handles both DB-backed and JSON-only stages
function buildStageDisplays(pd: ProductionDetail): StageDisplay[] {
  const p = pd as Record<string, unknown>;
  const extra = (pd.extraData as Record<string, unknown>) ?? {};
  const perItem = (extra.perItem as Record<string, unknown>) ?? {};
  const stageStatuses = (extra.stageStatuses as Record<string, string>) ?? {};
  const itemIds = Object.keys(perItem);

  return STAGE_DEFS.map((def) => {
    // DB-backed stage: read timestamps + crafter from ProductionDetail columns
    if (def.startField && def.doneField && def.crafterField) {
      const startAt = (p[def.startField] as Date | string | null) ?? null;
      const doneAt  = (p[def.doneField]  as Date | string | null) ?? null;
      const crafter = (p[def.crafterField] as string | null) ?? null;

      let stageStatus: StageDisplay["stageStatus"] = "pending";
      if (stageStatuses[def.code] === "cancelled") {
        stageStatus = "cancelled";
      } else if (doneAt) {
        stageStatus = "done";
      } else if (startAt) {
        stageStatus = "doing";
      }

      return {
        code: def.code,
        label: def.label,
        stageStatus,
        startAt: startAt ? String(startAt) : null,
        doneAt:  doneAt  ? String(doneAt)  : null,
        crafter,
      };
    }

    // JSON-only stage (TC_NGUOI, KHOA): aggregate from perItem — pick most-advanced status
    const priority: Record<string, number> = { pending: 0, doing: 1, hold: 1, qc: 2, done: 3, cancelled: -1 };
    let bestStatus: StageDisplay["stageStatus"] = "pending";
    let bestCrafter: string | null = null;

    for (const itemId of itemIds) {
      const itemData = (perItem[itemId] as Record<string, unknown>) ?? {};
      const stages = (itemData.stages as Record<string, Record<string, unknown>>) ?? {};
      const s = stages[def.code];
      if (!s) continue;
      const st = (s.stageStatus as string) ?? "pending";
      if ((priority[st] ?? 0) > (priority[bestStatus] ?? 0)) {
        bestStatus = st as StageDisplay["stageStatus"];
        bestCrafter = (s.crafter as string) || null;
      }
    }

    return { code: def.code, label: def.label, stageStatus: bestStatus, startAt: null, doneAt: null, crafter: bestCrafter };
  });
}

export function TabProduction({
  productionDetail: d,
}: {
  productionDetail: ProductionDetail | null;
}) {
  if (!d) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-sm text-gray-400">
        <AlertCircle className="w-8 h-8 mb-2 opacity-30" />
        Chưa có thông tin sản xuất. Đơn cần được chuyển sang Phòng Sản Xuất trước.
      </div>
    );
  }

  const stages = buildStageDisplays(d);

  return (
    <div className="p-5 space-y-6 max-w-2xl">
      {/* Workshop */}
      <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
        <SectionHeader title="Xưởng sản xuất" />
        <InfoRow label="Mã xưởng" value={d.workshopCode} />
        <InfoRow label="Tên xưởng" value={d.workshopName} />
        <InfoRow label="Giám sát" value={d.supervisorName} />
        <InfoRow label="Vật tư">
          <span className={cn("text-sm", d.materialReceived ? "text-green-600" : "text-gray-400")}>
            {d.materialReceived ? "✓ Đã nhận vật tư" : "Chưa nhận vật tư"}
          </span>
          {d.materialNote && (
            <p className="text-xs text-gray-500 mt-0.5">{d.materialNote}</p>
          )}
        </InfoRow>
      </div>

      {/* Production stages timeline */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <SectionHeader title="Tiến độ các giai đoạn" />
        <div className="p-4">
          <div className="space-y-0">
            {stages.map((stage, i) => {
              const done       = stage.stageStatus === "done";
              const inProgress = stage.stageStatus === "doing" || stage.stageStatus === "qc";
              const isQc       = stage.stageStatus === "qc";
              const isHold     = stage.stageStatus === "hold";
              const cancelled  = stage.stageStatus === "cancelled";
              const isLast     = i === stages.length - 1;

              return (
                <div key={stage.code} className="flex gap-3">
                  {/* Timeline connector */}
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "flex items-center justify-center w-7 h-7 rounded-full shrink-0 z-10",
                        done       ? "bg-green-100 text-green-600"   :
                        isQc       ? "bg-purple-100 text-purple-600" :
                        inProgress ? "bg-blue-100 text-blue-600"     :
                        isHold     ? "bg-amber-100 text-amber-700"   :
                        cancelled  ? "bg-gray-100 text-gray-300"     :
                                     "bg-gray-100 text-gray-300"
                      )}
                    >
                      {done      ? <CheckCircle2 className="w-4 h-4" /> :
                       cancelled ? <XCircle      className="w-4 h-4" /> :
                       isHold    ? <AlertCircle  className="w-4 h-4" /> :
                       inProgress ? <Clock       className="w-4 h-4" /> :
                                    <Circle      className="w-4 h-4" />}
                    </div>
                    {!isLast && (
                      <div
                        className={cn(
                          "w-0.5 flex-1 min-h-[20px]",
                          done ? "bg-green-200" : "bg-gray-100"
                        )}
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className={cn("pb-4 flex-1 min-w-0", isLast && "pb-0")}>
                    <p
                      className={cn(
                        "text-sm font-medium mt-0.5",
                        done       ? "text-gray-900"    :
                        isQc       ? "text-purple-700"  :
                        inProgress ? "text-blue-700"    :
                        cancelled  ? "text-gray-300 line-through" :
                                     "text-gray-400"
                      )}
                    >
                      {stage.label}
                      {inProgress && (
                        <span className={cn(
                          "ml-2 text-xs font-normal px-1.5 py-0.5 rounded",
                          isQc ? "bg-purple-100 text-purple-600" : "bg-blue-100 text-blue-600"
                        )}>
                          {isQc ? "Đang QC" : "Đang làm"}
                        </span>
                      )}
                      {cancelled && (
                        <span className="ml-2 text-xs font-normal bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">
                          Bỏ qua
                        </span>
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-0.5 text-xs text-gray-400">
                      {stage.startAt && (
                        <span>Bắt đầu: {formatDate(stage.startAt)}</span>
                      )}
                      {stage.doneAt && (
                        <span className="text-green-600">
                          Xong: {formatDate(stage.doneAt)}
                        </span>
                      )}
                      {stage.crafter && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {stage.crafter}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* QC result */}
      {(d.qcResult || d.qcNote || d.reworkCount > 0) && (
        <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          <SectionHeader title="Kết quả QC" />
          <InfoRow label="Kết quả">
            <QcBadge result={d.qcResult} />
          </InfoRow>
          {d.reworkCount > 0 && (
            <InfoRow label="Làm lại" value={`${d.reworkCount} lần`} />
          )}
          {d.qcNote && (
            <InfoRow label="Ghi chú">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{d.qcNote}</p>
            </InfoRow>
          )}
        </div>
      )}

      {/* Shipping */}
      {(d.shippingCarrier || d.trackingNumber || d.deliveredAt) && (
        <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          <SectionHeader title="Giao hàng" icon={<Truck className="w-4 h-4" />} />
          <InfoRow label="Đơn vị vận chuyển" value={d.shippingCarrier} />
          <InfoRow label="Mã vận đơn">
            {d.trackingNumber && (
              <span className="font-mono text-sm">{d.trackingNumber}</span>
            )}
          </InfoRow>
          <InfoRow label="Ngày giao" value={formatDate(d.deliveredAt)} />
        </div>
      )}

      {/* Internal note */}
      {d.internalNote && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
          <p className="text-xs font-semibold text-purple-600 mb-1">GHI CHÚ NỘI BỘ</p>
          <p className="text-sm text-purple-800 whitespace-pre-wrap">{d.internalNote}</p>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionHeader({ title, icon }: { title: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
      {icon}
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</span>
    </div>
  );
}

function InfoRow({ label, value, children }: { label: string; value?: string | null; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 px-4 py-2.5">
      <span className="w-44 shrink-0 text-sm text-gray-500">{label}</span>
      <div className="flex-1 min-w-0">
        {children ?? <span className="text-sm text-gray-800">{value ?? "—"}</span>}
      </div>
    </div>
  );
}

function QcBadge({ result }: { result: string | null }) {
  if (!result) return <span className="text-sm text-gray-400">Chưa có</span>;
  const styles: Record<string, string> = {
    PASS:   "bg-green-100 text-green-700",
    FAIL:   "bg-red-100 text-red-700",
    REWORK: "bg-orange-100 text-orange-700",
  };
  return (
    <span className={cn("text-sm px-2 py-0.5 rounded font-medium", styles[result] ?? "bg-gray-100 text-gray-600")}>
      {result}
    </span>
  );
}
