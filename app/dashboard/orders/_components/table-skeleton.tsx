// Skeleton loading — hiển thị khi dữ liệu chưa tải xong
// Dùng shimmer animation để báo hiệu loading

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-gray-200 ${className ?? ""}`}
    />
  );
}

// Một hàng skeleton trong bảng
function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100">
      {/* Mã đơn */}
      <td className="px-3 py-3 sticky left-0 bg-white">
        <Shimmer className="h-4 w-28" />
      </td>
      {/* Khách hàng */}
      <td className="px-3 py-3 sticky left-[150px] bg-white">
        <Shimmer className="h-4 w-32 mb-1" />
        <Shimmer className="h-3 w-24" />
      </td>
      {/* Trạng thái */}
      <td className="px-3 py-3">
        <Shimmer className="h-5 w-24 rounded-full" />
      </td>
      {/* Cờ */}
      <td className="px-3 py-3">
        <Shimmer className="h-4 w-10" />
      </td>
      {/* SP */}
      <td className="px-3 py-3">
        <Shimmer className="h-4 w-8" />
      </td>
      {/* Deadline */}
      <td className="px-3 py-3">
        <Shimmer className="h-4 w-20" />
      </td>
      {/* Giá trị */}
      <td className="px-3 py-3">
        <Shimmer className="h-4 w-24" />
      </td>
      {/* Phụ trách */}
      <td className="px-3 py-3">
        <Shimmer className="h-4 w-20" />
      </td>
    </tr>
  );
}

// Skeleton toàn trang (dùng khi Suspense fallback)
export function TableSkeleton() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header skeleton */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white">
        <Shimmer className="h-6 w-24" />
        <Shimmer className="h-8 w-20" />
      </div>

      {/* Tab bar skeleton */}
      <div className="shrink-0 flex items-center gap-6 px-5 py-2.5 border-b border-gray-200 bg-white">
        {["w-16", "w-28", "w-24"].map((w, i) => (
          <Shimmer key={i} className={`h-4 ${w}`} />
        ))}
      </div>

      {/* Toolbar skeleton */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-3 bg-white border-b border-gray-100">
        <Shimmer className="h-8 w-60" />
        <Shimmer className="h-8 w-16" />
        <Shimmer className="h-8 w-16" />
      </div>

      {/* Table skeleton */}
      <div className="flex-1 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["w-28", "w-36", "w-24", "w-10", "w-8", "w-20", "w-24", "w-20"].map((w, i) => (
                <th key={i} className="px-3 py-2.5">
                  <Shimmer className={`h-3 ${w}`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 10 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination skeleton */}
      <div className="shrink-0 flex items-center justify-between px-5 py-2.5 border-t border-gray-200 bg-white">
        <Shimmer className="h-4 w-32" />
        <div className="flex gap-1">
          <Shimmer className="h-7 w-7 rounded" />
          <Shimmer className="h-7 w-16 rounded" />
          <Shimmer className="h-7 w-7 rounded" />
        </div>
      </div>
    </div>
  );
}

// Skeleton chỉ cho nội dung (dùng khi re-fetch, không mất layout)
export function ContentSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <table className="w-full">
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </tbody>
    </table>
  );
}
