export type Locale = "vi" | "en";

export type Labels = {
  status: Record<string, string>;
  zone: Record<string, string>;
  category: Record<string, string>;
  material: Record<string, string>;
  stage: Record<string, string>;
  stageStatus: Record<string, string>;
  priority: Record<string, string>;
  ui: {
    all: string;
    lang: string;
    pageTitle: string;
    createOrder: string;
    tableView: string;
    cardView: string;
    noOrdersFound: string;
    createdPrefix: string;
    createdSuffix: string;
    nav: {
      orders: string;
      newOrder: string;
      alerts: string;
      stores: string;
      admin: string;
      userManagement: string;
    };
    mhViews: Record<string, string>;
    sortOptions: Record<string, string>;
    monthPresets: Record<string, string>;
    tabs: Record<string, string>;
    columns: Record<string, string>;
    sync: string;
    syncing: string;
    suspended: string;
    noOrders: string;
    loadError: string;
    retry: string;
    prev: string;
    next: string;
    orders: string;
    cachedNote: string;
    search: string;
    panel: {
      tabOrder: string;
      tabItems: string;
      tabStatus: string;
      tabHistory: string;
      tabTechnical: string;
      tabProduction: string;
      tabProgress: string;
      sectionCustomer: string;
      sectionGeneral: string;
      sectionTimeline: string;
      sectionStatus: string;
      sectionAlerts: string;
      sectionPromote: string;
      sectionWorkshop: string;
      sectionTechnicalInfo: string;
      sectionProductionDetail: string;
      sectionWeightStatus: string;
      sectionResults: string;
      sectionProgress: string;
      sectionHistoryTitle: string;
      fieldCreatedDate: string;
      fieldCustomer: string;
      fieldCustomerType: string;
      fieldSales: string;
      fieldSource: string;
      fieldStarOrder: string;
      fieldChatLink: string;
      fieldPriority: string;
      fieldCommitDate: string;
      fieldRequiredDate: string;
      fieldEstWeek: string;
      fieldStatusMo: string;
      fieldWorkshop: string;
      fieldSupervisor: string;
      cantEdit: string;
      canEdit: string;
      yes: string;
      no: string;
      statusPlaceholder: string;
      loadError: string;
      retry: string;
      reload: string;
      close: string;
      save: string;
      saved: string;
      cancel: string;
      processing: string;
      promoteBtn: string;
      confirmPromote: string;
      moDefaultHint: string;
      promoteNotePlaceholder: string;
      confirmRollback: string;
      versionToggle: string;
      versionToggleOn: string;
      versionToggleOff: string;
      modified: string;
      missingNvl: string;
      locked: string;
      specsLocked: string;
      /** Bản cho vai GHI-MỘT-PHẦN (R&D): họ không có nút "Thiết kế lại" nên câu trên chỉ sai đường. */
      specsLockedPartial: string;
      noItems: string;
      missingNvlWarning: string;
      viewFile3d: string;
      fieldMainStone: string;
      fieldSlabStone: string;
      fieldTechClass: string;
      fieldLoaiHang: string;
      fieldStoneShape: string;
      fieldProductDesc: string;
      fieldProductNote: string;
      fieldTho3d: string;
      phTho3d: string;
      fieldSku: string;
      phSku: string;
      fieldChiTietKt: string;
      phChiTietKt: string;
      fieldMoStatus: string;
      fieldCurrentStage: string;
      notStarted: string;
      fieldQd24k: string;
      fieldQdPt: string;
      fieldQdBac: string;
      autoCalc: string;
      phCompletionInfo: string;
      fieldInternalNote: string;
      phInternalNote: string;
      bannerInStage: string;
      bannerLastStage: string;
      colStage: string;
      colCrafter: string;
      phCrafter: string;
      alertCount: string;
    };
    form: {
      orderInfo: string;
      productList: string;
      productUnit: string;
      flowProduction: string;
      flowPreProd: string;
      flowHintProduction: string;
      flowHintPreProd: string;
      soOdoo: string;
      customer: string;
      sales: string;
      source: string;
      customerType: string;
      priority: string;
      commitDate: string;
      expectedDate: string;
      starOrder: string;
      starYes: string;
      starNo: string;
      chatLink: string;
      salesNote: string;
      productLabel: string;
      tenSp: string;
      moNumber: string;
      nvl: string;
      size: string;
      plating: string;
      weightReq: string;
      mainStone: string;
      mainStoneSpec: string;
      slabStoneSpec: string;
      designFile: string;
      productDesc: string;
      productNote: string;
      addProduct: string;
      duplicate: string;
      remove: string;
      save: string;
      saving: string;
      cancel: string;
      select: string;
      notSet: string;
      days: string;
      quantity: string;
      phCustomer: string;
      phSales: string;
      phSalesNote: string;
      phProductDesc: string;
      phProductNote: string;
      autoDateHint: string;
      manualDate: string;
      moHint: string;
      soHint: string;
      soChecking: string;
      soValid: string;
      soTaken: string;
      viewOrder: string;
      searching: string;
      footerNote: string;
      footerSoEmpty: string;
      phSalesNoteSidebar: string;
      phSizeSidebar: string;
      phMainStoneSidebar: string;
      phSlabStoneSidebar: string;
    };
    dashboard: {
      total: string;
      totalSub: string;
      designRoom: string;
      designSub: string;
      productionRoom: string;
      productionSub: string;
      overdue: string;
      overdueSub: string;
      suspendedLabel: string;
      criticalLabel: string;
      viewLink: string;
      goldTitle: string;
      goldHeader: string;
      goldSo: string;
      goldNote: string;
      goldEmpty: string;
      goldEmptyHint: string;
      goldMa: string;
      goldCustomer: string;
      goldNvl: string;
      goldDelivery: string;
      goldWeight3d: string;
      goldCasting: string;
      quickAccess: string;
      createOrder: string;
      designRoomLink: string;
      productionLink: string;
      suspendedLink: string;
    };
    alerts: {
      pageTitle: string;
      criticalCount: string;
      createBtn: string;
      unresolved: string;
      resolvedTab: string;
      noAlerts: string;
      createTitle: string;
      resolveTitle: string;
      chooseOrder: string;
      chooseMo: string;
      typeLabel: string;
      severityLabel: string;
      severityLow: string;
      severityMedium: string;
      severityHigh: string;
      severityCritical: string;
      typeSPECIAL: string;
      typeMATERIAL_SHORTAGE: string;
      typeRUSH_ORDER: string;
      typeQUALITY_ISSUE: string;
      typeDESIGN_CHANGE: string;
      typeCUSTOMER_COMPLAINT: string;
      titleField: string;
      descField: string;
      autoSuspendWarning: string;
      creating: string;
      createConfirm: string;
      suspendedBadge: string;
      resolveBtn: string;
      resolveAction: string;
      resumeLabel: string;
      resumeDesc: string;
      showroomLabel: string;
      showroomDesc: string;
      rollbackLabel: string;
      rollbackDesc: string;
      cancelLabel: string;
      cancelDesc: string;
      noteCancelLabel: string;
      noteRollbackLabel: string;
      noteGenericLabel: string;
      placeholderCancel: string;
      placeholderRollback: string;
      placeholderGeneric: string;
      cancelWarning: string;
      rollbackWarning: string;
      processing: string;
      confirm: string;
      cancelBtn: string;
      badgeCancelled: string;
      badgeShowroom: string;
      badgeResume: string;
      resolvedLabel: string;
      orderStatus: string;
      onHoldStatus: string;
    };
    table: {
      orderDate: string; requiredDate: string; estimatedDate: string;
      /**
       * Bản NGẮN của hai nhãn ngày trên, dùng khi chúng đứng chung một tiêu đề cột.
       *
       * Ghép nguyên bản dài ra "Ngày chốt SX → Ngày DK HT" — 25 ký tự, ép cột rộng 172px trong
       * khi nội dung chỉ chiếm 140px, và lặp chữ "Ngày" hai lần trên cùng một dòng. Bảng đang
       * phải kéo ngang thì mỗi tiêu đề dài vô cớ là một phần của vấn đề.
       */
      estimatedDateShort: string; requiredDateShort: string;
      status: string; tenSp: string; customer: string;
      ghiChuSp: string; ghiChuSales: string; mainStone: string;
      congDoan: string; tlXuong: string; tl3d: string; warning: string;
      source: string; customerType: string; priority: string;
      plating: string; designFile3D: string; weightReq: string;
      weightWorkshop: string; techClass: string; stoneType: string;
      slabStone: string; completedDate: string; weightActual: string;
      weightEval: string; pctDiff: string; completionInfo: string;
      specialAlert: string; loading: string; noOrders: string;
      noMatch: string; clearFilters: string; noOrdersCount: string;
      showing: string; ordersWord: string; perPage: string; view: string;
    };
    toolbar: {
      searchPlaceholder: string; priority: string;
      filter: string; clearFilter: string; orders: string;
      statusLabel: string; allStatuses: string; dateCreated: string;
      deadline: string; next7Days: string; overdueLabel: string;
      dateFrom: string; dateTo: string; sort: string;
      today: string; days7: string; days30: string; allDates: string;
      sortOrderDateDesc: string; sortOrderDateAsc: string;
      sortRequiredDateAsc: string; sortRequiredDateDesc: string;
      sortCustomerNameAsc: string; sortEstimatedTotalDesc: string;
    };
  };
  stoneTypes: string[];
  phanLoaiKt: string[];
  hinhDangHot: string[];
  tenSp: string[];
  techClass: string[];
};

export const LABELS: Record<Locale, Labels> = {
  vi: {
    status: {
      DRAFT:              "Chưa thiết kế",
      PENDING_DESIGN:     "Làm INFO",
      IN_DESIGN:          "Đang thiết kế",
      DESIGN_REVIEW:      "Chờ khách duyệt",
      DESIGN_APPROVED:    "Chốt 3D — Chuyển xưởng",
      DESIGN_COMPLETED:   "Hoàn tất 3D",
      PENDING_PRODUCTION: "Đang chờ",
      IN_PRODUCTION:      "Đang sản xuất",
      QUALITY_CHECK:      "Tạm ngưng - Chờ duyệt",
      COMPLETED:          "Hoàn tất",
      SUSPENDED:          "Tạm ngưng",
      CANCELLED:          "Đã hủy",
    },
    zone: {
      PRE_PRODUCTION: "Phòng Thiết Kế",
      MASTER_HUB:     "Phòng Sản Xuất",
    },
    category: {
      NECKLACE: "Dây chuyền",
      RING:     "Nhẫn",
      EARRING:  "Bông tai",
      BRACELET: "Vòng tay",
      PENDANT:  "Mặt dây",
      BROOCH:   "Ghim cài",
      OTHER:    "Khác",
    },
    material: {
      GOLD_18K:   "Vàng 18K",
      GOLD_24K:   "Vàng 24K",
      SILVER_925: "Bạc 925",
      PLATINUM:   "Bạch kim",
      DIAMOND:    "Kim cương",
      GEMSTONE:   "Đá quý",
      PEARL:      "Ngọc trai",
      OTHER:      "Khác",
    },
    stage: {
      RESIN:      "Resin",
      CHO_DX_NL:  "Chờ ĐX NL",
      CHO_NL:     "Chờ NL",
      DUC:        "Đúc kim loại",
      NGUOI:      "Nguội",
      TC_DAY:   "Thủ công dây",
      TC_NGUOI: "Thủ công nguội",
      KHOA:     "Khóa",
      HOT:      "Gắn đá (Hột)",
      MOC:      "Móc máy",
      DBXM:     "ĐBXM (Mạ)",
      QC:       "QC - Chờ nhập kho",
      DUYET_NK: "Chờ duyệt nhập kho",
      TC:       "Thủ công",
    },
    stageStatus: {
      pending:   "Đang chờ",
      doing:     "Đang làm",
      qc:        "Đang QC",
      done:      "Xong",
      cancelled: "Bỏ qua",
    },
    priority: {
      UT1:    "UT1 — Siêu gấp",
      UT2:    "UT2 — Gấp",
      Normal: "Normal",
      SR:     "SR — Đặc biệt",
    },
    ui: {
      all:           "Tất cả",
      lang:          "VI",
      pageTitle:     "Đơn hàng",
      createOrder:   "Tạo đơn",
      tableView:     "Dạng bảng",
      cardView:      "Dạng thẻ",
      noOrdersFound: "Không tìm thấy đơn hàng nào",
      createdPrefix: "Tạo đơn",
      createdSuffix: "thành công!",
      nav: {
        orders:         "Danh sách đơn hàng",
        newOrder:       "Tạo đơn mới",
        alerts:         "Cảnh báo",
        stores:         "Cửa hàng",
        admin:          "Admin",
        userManagement: "Quản lý User",
      },
      // ⚠️ GIỮ CẢ NĂM NHÃN — ĐỪNG DỌN.
      // Tab Phòng Sản Xuất ở màn Đơn hàng giờ chỉ còn một bảng, nên bốn nhãn tiendo/dondang/
      // kythuat/ketqua trông như rác. KHÔNG PHẢI: màn Cửa hàng (stores/[storeId]) vẫn có bốn
      // view đó và đọc nhãn từ đây. Xoá là tab bên đó mất chữ — và tsc KHÔNG bắt được, vì
      // mhViews có kiểu Record<string, string>.
      mhViews: {
        tongquan: "Tổng quan",
        tiendo:  "Tiến độ",
        dondang: "Đơn hàng",
        kythuat: "Kỹ thuật",
        ketqua:  "Kết quả",
      },
      sortOptions: {
        "requiredDate:asc":  "Deadline gần nhất",
        "orderDate:desc":    "Ngày tạo mới nhất",
        "customerName:asc":  "Tên khách A → Z",
      },
      monthPresets: {
        current:  "Tháng này",
        previous: "Tháng trước",
        all:      "Tất cả",
      },
      tabs: {
        all:              "Tất cả",
        active:           "Đang hoạt động",
        "pre-production": "Phòng Thiết Kế",
        "master-hub":     "Phòng Sản Xuất",
        completed:        "Hoàn tất",
        cancelled:        "Đã hủy",
      },
      columns: {
        mo:             "MO#",
        customer:       "Khách hàng",
        product:        "Sản phẩm",
        nvl:            "NVL",
        status:         "Trạng thái",
        dueDate:        "Ngày DK HT",
        nvlSize:        "NVL / Size",
        plating:        "Xi mạ",
        mainStone:      "Đá chủ",
        weight:         "TL (g)",
        stoneType:      "Loại đá",
        stoneSpec:      "Thông số đá",
        weight3d:       "TL 3D (g)",
        workshopWeight: "TL Xưởng (g)",
        evaluation:     "Đánh giá",
        deviation:      "% Chênh",
      },
      sync:       "Đồng bộ",
      syncing:    "Đang đồng bộ...",
      suspended:  "tạm ngưng",
      noOrders:   "Không có đơn hàng nào",
      loadError:  "Không thể tải dữ liệu.",
      retry:      "Thử lại",
      prev:       "← Trước",
      next:       "Tiếp →",
      orders:     "MO",
      cachedNote: "dữ liệu cache, đồng bộ để xem mới nhất",
      search:     "Tìm mã đơn, KH, Sales, MO#, sản phẩm (hỗ trợ không dấu)",
      panel: {
        tabOrder:      "Đơn hàng",
        tabItems:      "Sản phẩm",
        tabStatus:     "Trạng thái",
        tabHistory:    "Lịch sử",
        tabTechnical:  "Kỹ thuật",
        tabProduction: "Sản xuất",
        tabProgress:   "Tiến độ",
        sectionCustomer:         "Thông tin khách hàng",
        sectionGeneral:          "Thông tin chung",
        sectionTimeline:         "Thời gian & Ưu tiên (per-MO)",
        sectionStatus:           "Trạng thái",
        sectionAlerts:           "Cảnh báo đặc biệt",
        sectionPromote:          "Chuyển sang sản xuất",
        sectionWorkshop:         "Xưởng sản xuất",
        sectionTechnicalInfo:    "Thông tin kỹ thuật sản phẩm",
        sectionProductionDetail: "Chi tiết kỹ thuật sản xuất",
        sectionWeightStatus:     "Trạng thái & Trọng lượng",
        sectionResults:          "Kết quả hoàn tất",
        sectionProgress:         "Tiến độ công đoạn",
        sectionHistoryTitle:     "Lịch sử cập nhật",
        fieldCreatedDate:  "Ngày tạo",
        fieldCustomer:     "Khách hàng",
        fieldCustomerType: "Phân loại KH",
        fieldSales:        "Sales",
        fieldSource:       "Nguồn",
        fieldStarOrder:    "3 Sao",
        fieldChatLink:     "Link Chat",
        fieldPriority:     "Ưu tiên",
        fieldCommitDate:   "Ngày chốt SX",
        fieldRequiredDate: "Ngày DK hoàn thành",
        fieldEstWeek:      "Tuần dự kiến",
        fieldStatusMo:     "Trạng thái MO",
        fieldWorkshop:     "Xưởng",
        fieldSupervisor:   "Giám sát",
        cantEdit:  "Không thể sửa",
        canEdit:   "Có thể sửa",
        yes: "Có",
        no:  "Không",
        statusPlaceholder:     "-- Chọn trạng thái --",
        loadError:             "Không thể tải đơn hàng.",
        retry:                 "Thử lại",
        reload:                "Tải lại",
        close:                 "Đóng",
        save:                  "Lưu thay đổi",
        saved:                 "Đã lưu",
        cancel:                "Hủy",
        processing:            "Đang xử lý...",
        promoteBtn:            "Chuyển xuống →",
        confirmPromote:        "Xác nhận chuyển xưởng",
        moDefaultHint:         "(mặc định = SO#)",
        promoteNotePlaceholder: "Ghi chú chuyển xưởng (không bắt buộc)...",
        confirmRollback:       "Xác nhận Thiết kế lại",
        versionToggle:         "Tạo phiên bản mới khi lưu",
        versionToggleOn:       "Snapshot sẽ được tạo — bản gốc giữ nguyên",
        versionToggleOff:      "Lưu trực tiếp vào đơn hiện tại",
        modified:              "Đã sửa",
        missingNvl:            "Thiếu NVL",
        locked:                "ĐÃ CHỐT",
        specsLocked:           "Thông số sản phẩm đã chốt. Muốn chỉnh sửa → nhấn Thiết kế lại để chuyển đơn về Phòng Thiết Kế.",
        specsLockedPartial:    "Thông số sản phẩm chỉ để xem. Bạn nhập Mã số mẫu ở ô đầu tiên bên dưới, rồi bấm Lưu.",
        noItems:               "Chưa có sản phẩm nào.",
        missingNvlWarning:     "Cần nhập NVL cho tất cả sản phẩm trước khi chuyển xưởng.",
        viewFile3d:            "Xem file 3D",
        fieldMainStone:        "Đá chủ",
        fieldSlabStone:        "Đá tấm",
        fieldTechClass:        "Phân loại KT",
        fieldLoaiHang:         "Loại hàng",
        fieldStoneShape:       "Hình dáng hột",
        fieldProductDesc:      "Diễn giải SP",
        fieldProductNote:      "Ghi chú SP",
        fieldTho3d:            "Nhân viên Thiết kế 3D",
        phTho3d:               "Tên nhân viên Thiết kế 3D",
        fieldSku:              "SKU",
        phSku:                 "Mã SKU",
        fieldChiTietKt:        "Chi tiết KT",
        phChiTietKt:           "Ghi chú kỹ thuật chi tiết...",
        fieldMoStatus:         "Trạng thái MO",
        fieldCurrentStage:     "Công đoạn hiện tại",
        notStarted:            "Chưa bắt đầu",
        fieldQd24k:            "QĐ 24K (g)",
        fieldQdPt:             "QĐ PT (g)",
        fieldQdBac:            "QĐ Bạc (g)",
        autoCalc:              "tự tính",
        phCompletionInfo:      "Chi tiết kết quả hoàn tất...",
        fieldInternalNote:     "Ghi chú nội bộ",
        phInternalNote:        "Ghi chú nội bộ cho xưởng...",
        bannerInStage:         "Đang ở công đoạn",
        bannerLastStage:       "Công đoạn tiếp theo",
        colStage:              "Công đoạn",
        colCrafter:            "Thợ phụ trách",
        phCrafter:             "Tên thợ",
        alertCount:            "cảnh báo",
      },
      form: {
        orderInfo:          "Thông tin đơn hàng",
        productList:        "Danh sách sản phẩm",
        productUnit:        "sản phẩm",
        flowProduction:     "Sản xuất ngay",
        flowPreProd:        "Phòng Thiết Kế",
        flowHintProduction: "Luồng: Xưởng Sản Xuất",
        flowHintPreProd:    "Luồng: Phòng Thiết Kế",
        soOdoo:             "SO# (Odoo)",
        customer:           "Khách hàng",
        sales:              "Sales",
        source:             "Nguồn",
        customerType:       "Phân loại KH",
        priority:           "Mức ưu tiên",
        commitDate:         "Ngày chốt SX",
        expectedDate:       "Dự kiến hoàn thành",
        starOrder:          "Đơn hàng 3 sao",
        starYes:            "Có ★★★",
        starNo:             "Không",
        chatLink:           "Link Chat",
        salesNote:          "Ghi chú Sales",
        productLabel:       "Sản phẩm",
        tenSp:              "Tên sản phẩm",
        moNumber:           "MO#",
        nvl:                "NVL",
        size:               "Size",
        plating:            "Xi mạ",
        weightReq:          "TL YC (g)",
        mainStone:          "Loại đá chủ",
        mainStoneSpec:      "Thông số đá chủ",
        slabStoneSpec:      "Thông số đá tấm",
        designFile:         "Ảnh / File 3D",
        productDesc:        "Diễn giải sản phẩm",
        productNote:        "Ghi chú sản phẩm",
        addProduct:         "Thêm sản phẩm",
        duplicate:          "Nhân bản",
        remove:             "Xóa ×",
        save:               "LƯU ĐƠN HÀNG",
        saving:             "Đang kiểm tra...",
        cancel:             "Hủy",
        select:             "-- Chọn --",
        notSet:             "-- Chưa xác định --",
        days:               "ngày",
        quantity:           "Số lượng",
        phCustomer:         "Nhập tên khách hàng",
        phSales:            "Nhập tên Sales",
        phSalesNote:        "Ghi chú thêm về đơn hàng...",
        phProductDesc:      "Mô tả chi tiết yêu cầu kỹ thuật...",
        phProductNote:      "Ví dụ: ôm vừa tay, bo góc mềm, không sắc cạnh...",
        autoDateHint:       "Tự tính — có thể điều chỉnh",
        manualDate:         "Đã điều chỉnh thủ công",
        moHint:             "Định danh sản phẩm — VD: 26.10680",
        soHint:             "Mã đơn từ Odoo — VD: 26.10680",
        soChecking:         "Đang kiểm tra...",
        soValid:            "SO# hợp lệ",
        soTaken:            "SO# này đã tồn tại",
        viewOrder:          "Xem đơn",
        searching:          "đang tìm...",
        footerNote:         "SO# và MO# bắt buộc điền từ Odoo",
        footerSoEmpty:      "SO#: chưa nhập",
        phSalesNoteSidebar: "Ghi chú từ Sales...",
        phSizeSidebar:      "VD: 6.1in, 52mm",
        phMainStoneSidebar: "VD: 5.4mm × 1v",
        phSlabStoneSidebar: "VD: RD2.2mm",
      },
      dashboard: {
        total:           "Tổng đơn hàng",
        totalSub:        "Tất cả MO",
        designRoom:      "Phòng Thiết Kế",
        designSub:       "Đang thiết kế",
        productionRoom:  "Phòng Sản Xuất",
        productionSub:   "Xưởng sản xuất",
        overdue:         "Quá hạn",
        overdueSub:      "Đã qua ngày dự kiến",
        suspendedLabel:  "MO đang tạm ngưng",
        criticalLabel:   "cảnh báo CRITICAL chưa xử lý",
        viewLink:        "Xem →",
        goldTitle:       "Dự đoán vàng cần chuẩn bị",
        goldHeader:      "Vàng cần chuẩn bị",
        goldSo:          "SO đang sản xuất",
        goldNote:        "* Chỉ tính SO chưa qua công đoạn Đúc. Dùng TL 3D nếu có, ngược lại dùng TL yêu cầu. Hao hụt +5%.",
        goldEmpty:       "Không có đơn nào đang sản xuất cần chuẩn bị vàng.",
        goldEmptyHint:   "Đơn trong Phòng Sản Xuất chưa qua công đoạn Đúc sẽ xuất hiện ở đây.",
        goldMa:          "Mã SO",
        goldCustomer:    "Khách hàng",
        goldNvl:         "NVL",
        goldDelivery:    "Ngày giao",
        goldWeight3d:    "TL 3D (g)",
        goldCasting:     "Cần đúc (+5%)",
        quickAccess:     "Truy cập nhanh",
        createOrder:     "+ Tạo đơn mới",
        designRoomLink:  "Phòng Thiết Kế",
        productionLink:  "Phòng Sản Xuất",
        suspendedLink:   "Tạm ngưng",
      },
      alerts: {
        pageTitle:         "Cảnh báo",
        criticalCount:     "cảnh báo CRITICAL chưa xử lý",
        createBtn:         "Tạo cảnh báo",
        unresolved:        "Chưa xử lý",
        resolvedTab:       "Đã xử lý",
        noAlerts:          "Không có cảnh báo nào cần xử lý.",
        createTitle:       "Tạo cảnh báo mới",
        resolveTitle:      "Giải quyết cảnh báo",
        chooseOrder:       "Đơn hàng *",
        chooseMo:          "MO cần cảnh báo *",
        typeLabel:         "Loại cảnh báo",
        severityLabel:     "Mức độ",
        severityLow:       "Thấp",
        severityMedium:    "Trung bình",
        severityHigh:      "Cao",
        severityCritical:  "Nghiêm trọng",
        typeSPECIAL:            "Đặc biệt",
        typeMATERIAL_SHORTAGE:  "Thiếu nguyên liệu",
        typeRUSH_ORDER:         "Đơn gấp",
        typeQUALITY_ISSUE:      "Vấn đề chất lượng",
        typeDESIGN_CHANGE:      "Thay đổi thiết kế",
        typeCUSTOMER_COMPLAINT: "Khiếu nại khách hàng",
        titleField:        "Tiêu đề *",
        descField:         "Chi tiết (tuỳ chọn)",
        autoSuspendWarning: "Cảnh báo sẽ tự động tạm ngưng đơn hàng và thay thế cảnh báo cũ (nếu có).",
        creating:          "Đang tạo...",
        createConfirm:     "Tạo cảnh báo",
        suspendedBadge:    "Tạm ngưng",
        resolveBtn:        "Giải quyết",
        resolveAction:     "Chọn hành động *",
        resumeLabel:       "Tiếp tục sản xuất",
        resumeDesc:        "Bỏ tạm ngưng, đơn hàng tiếp tục được xử lý bình thường",
        showroomLabel:     "Chuyển thành Showroom",
        showroomDesc:      "Đổi thành Hàng Showroom, gắn hậu tố -SR và tiếp tục sản xuất",
        rollbackLabel:     "Thiết kế lại",
        rollbackDesc:      "Chuyển MO về Phòng Thiết Kế để xử lý lại từ đầu",
        cancelLabel:       "Hủy đơn",
        cancelDesc:        "Hủy toàn bộ đơn hàng — không thể hoàn tác",
        noteCancelLabel:   "Lý do hủy *",
        noteRollbackLabel: "Lý do thiết kế lại (tuỳ chọn)",
        noteGenericLabel:  "Ghi chú (tuỳ chọn)",
        placeholderCancel:   "Nhập lý do hủy đơn...",
        placeholderRollback: "Mô tả lý do cần thiết kế lại...",
        placeholderGeneric:  "Mô tả cách đã xử lý vấn đề...",
        cancelWarning:     "Hành động này sẽ hủy vĩnh viễn đơn hàng và không thể hoàn tác.",
        rollbackWarning:   "Dữ liệu sản xuất sẽ được lưu snapshot trước khi chuyển về Phòng Thiết Kế.",
        processing:        "Đang xử lý...",
        confirm:           "Xác nhận",
        cancelBtn:         "Huỷ",
        badgeCancelled:    "HỦY ĐƠN",
        badgeShowroom:     "SHOWROOM",
        badgeResume:       "TIẾP TỤC",
        resolvedLabel:     "Đã giải quyết",
        orderStatus:       "Trạng thái đơn:",
        onHoldStatus:      "Đang tạm ngưng",
      },
      table: {
        orderDate:      "Ngày tạo",
        requiredDate:   "Ngày DK HT",
        estimatedDate:  "Ngày chốt SX",
        estimatedDateShort: "Chốt SX",
        requiredDateShort:  "DK HT",
        status:         "Trạng thái",
        tenSp:          "Sản phẩm",
        customer:       "Khách hàng",
        ghiChuSp:       "Ghi chú SP",
        ghiChuSales:    "Ghi chú Sales",
        mainStone:      "Đá chủ",
        congDoan:       "Công đoạn",
        tlXuong:        "TL xuống (g)",
        tl3d:           "TL 3D (g)",
        warning:        "Cảnh báo",
        source:         "Nguồn",
        customerType:   "Phân loại KH",
        priority:       "Ưu tiên",
        plating:        "Xi mạ",
        designFile3D:   "Ảnh 3D",
        weightReq:      "TL YC (g)",
        weightWorkshop: "TL Xưởng (g)",
        techClass:      "Phân loại KT",
        stoneType:      "Loại hột",
        slabStone:      "Đá tấm",
        completedDate:  "Ngày HT",
        weightActual:   "TL HT (g)",
        weightEval:     "Đánh giá TL",
        pctDiff:        "% Chênh lệch",
        completionInfo: "Thông tin HT",
        specialAlert:   "Cảnh báo ĐB",
        loading:        "Đang tải...",
        noOrders:       "Chưa có đơn hàng nào",
        noMatch:        "Không có đơn nào khớp với bộ lọc hiện tại",
        clearFilters:   "Xóa bộ lọc",
        noOrdersCount:  "Không có đơn",
        showing:        "Hiển thị",
        ordersWord:     "MO",
        perPage:        "/ trang",
        view:           "Xem",
      },
      toolbar: {
        searchPlaceholder: "Tìm mã đơn, KH, Sales, MO#, sản phẩm (hỗ trợ không dấu)",
        priority:       "Ưu tiên",
        filter:         "Lọc",
        clearFilter:    "Xóa lọc",
        orders:         "MO",
        statusLabel:    "Trạng thái",
        allStatuses:    "Tất cả",
        dateCreated:    "Ngày tạo",
        deadline:       "Deadline",
        next7Days:      "7 ngày tới",
        overdueLabel:   "Đã quá hạn",
        dateFrom:       "Từ ngày",
        dateTo:         "Đến ngày",
        sort:           "Sắp xếp",
        today:          "Hôm nay",
        days7:          "7 ngày",
        days30:         "30 ngày",
        allDates:       "Tất cả",
        sortOrderDateDesc:      "Ngày tạo (mới nhất)",
        sortOrderDateAsc:       "Ngày tạo (cũ nhất)",
        sortRequiredDateAsc:    "Deadline (gần nhất)",
        sortRequiredDateDesc:   "Deadline (xa nhất)",
        sortCustomerNameAsc:    "Tên khách (A → Z)",
        sortEstimatedTotalDesc: "Giá trị (cao → thấp)",
      },
    },
    stoneTypes: ["XOÀN TN", "LAB", "CZ", "ĐÁ MÀU", "NGỌC TRAI"],
    phanLoaiKt: ["TRƠN", "NATURAL", "M.MÁY", "LAB", "CZ", "ĐÁ", "ĐÁ MÀU", "NGỌC TRAI"],
    hinhDangHot: [
      "Tròn/RD", "Vuông/PR", "Ống đầu bằng/BG", "Ống đầu nhọn/TD",
      "Vuông chặt góc/CU", "Hình trái xoan/OV", "Ngọc lục bảo/EMR",
      "Giọt nước/PS", "Trái tim/HS", "Hạt dưa/MQ", "Tám góc/AS",
      "Chữ nhật chặt góc/RAD", "Tam giác/TR", "Bán nguyệt/HM", "Ngọc trai/RD-P",
    ],
    tenSp: [
      "Vỏ nhẫn",
      "Vỏ nhẫn xoàn", "Vỏ nhẫn trơn", "Nhẫn band xoàn", "Nhẫn band trơn",
      "Vỏ mặt xoàn", "Vỏ mặt trơn", "Mặt dây xoàn", "Mặt dây trơn",
      "Vỏ vòng xoàn", "Vỏ vòng trơn", "Vòng tay xoàn", "Vỏ bông tai xoàn",
      "Vỏ bông tai trơn", "Bông tai xoàn", "Bông tai trơn", "Vỏ lắc xoàn",
      "Vỏ lắc trơn", "Lắc tay xoàn", "Lắc tay trơn", "Dây chuyền",
      "Vỏ vòng cổ xoàn", "Vỏ vòng cổ trơn", "Vòng cổ xoàn", "Vòng cổ trơn",
      "Phụ kiện", "Charm",
      "Dây chuyền tay", "Khoen mũi",
    ],
    techClass: ["Trơn", "Chấm CZ", "CNC", "Laser", "Khắc tay", "Đính đá chủ", "Đính đá tấm", "Phức hợp"],
  },

  en: {
    status: {
      DRAFT:              "Awaiting Design",
      PENDING_DESIGN:     "Pending Info",
      IN_DESIGN:          "In Design",
      DESIGN_REVIEW:      "Design Review",
      DESIGN_APPROVED:    "Design Approved",
      DESIGN_COMPLETED:   "3D Completed",
      PENDING_PRODUCTION: "Pending",
      IN_PRODUCTION:      "In Production",
      QUALITY_CHECK:      "On Hold",
      COMPLETED:          "Completed",
      SUSPENDED:          "Suspended",
      CANCELLED:          "Cancelled",
    },
    zone: {
      PRE_PRODUCTION: "Design Room",
      MASTER_HUB:     "Production Room",
    },
    category: {
      NECKLACE: "Necklace",
      RING:     "Ring",
      EARRING:  "Earring",
      BRACELET: "Bracelet",
      PENDANT:  "Pendant",
      BROOCH:   "Brooch",
      OTHER:    "Other",
    },
    material: {
      GOLD_18K:   "18K Gold",
      GOLD_24K:   "24K Gold",
      SILVER_925: "925 Silver",
      PLATINUM:   "Platinum",
      DIAMOND:    "Diamond",
      GEMSTONE:   "Gemstone",
      PEARL:      "Pearl",
      OTHER:      "Other",
    },
    stage: {
      RESIN:      "Resin",
      CHO_DX_NL:  "Await Design Mat.",
      CHO_NL:     "Await Material",
      DUC:        "Metal Casting",
      NGUOI:      "Finishing",
      TC_DAY:   "Hand Craft (Wire)",
      TC_NGUOI: "Hand Craft (Cold)",
      KHOA:     "Clasp",
      HOT:      "Stone Setting",
      MOC:      "Machine Polish",
      DBXM:     "Plating",
      QC:       "QC - Awaiting Warehouse",
      DUYET_NK: "Awaiting Warehouse Approval",
      TC:       "Hand Craft",
    },
    stageStatus: {
      pending:   "Pending",
      doing:     "In Progress",
      qc:        "In QC",
      done:      "Done",
      cancelled: "Skipped",
    },
    priority: {
      UT1:    "UT1 — Ultra Urgent",
      UT2:    "UT2 — Urgent",
      Normal: "Normal",
      SR:     "SR — Special",
    },
    ui: {
      all:           "All",
      lang:          "EN",
      pageTitle:     "Orders",
      createOrder:   "New Order",
      tableView:     "Table View",
      cardView:      "Card View",
      noOrdersFound: "No orders found",
      createdPrefix: "Order",
      createdSuffix: "created!",
      nav: {
        orders:         "Orders",
        newOrder:       "New Order",
        alerts:         "Alerts",
        stores:         "Stores",
        admin:          "Admin",
        userManagement: "User Management",
      },
      // ⚠️ GIỮ CẢ NĂM NHÃN — ĐỪNG DỌN.
      // Tab Phòng Sản Xuất ở màn Đơn hàng giờ chỉ còn một bảng, nên bốn nhãn tiendo/dondang/
      // kythuat/ketqua trông như rác. KHÔNG PHẢI: màn Cửa hàng (stores/[storeId]) vẫn có bốn
      // view đó và đọc nhãn từ đây. Xoá là tab bên đó mất chữ — và tsc KHÔNG bắt được, vì
      // mhViews có kiểu Record<string, string>.
      mhViews: {
        tongquan: "Overview",
        tiendo:  "Progress",
        dondang: "Orders",
        kythuat: "Technical",
        ketqua:  "Results",
      },
      sortOptions: {
        "requiredDate:asc": "Nearest Deadline",
        "orderDate:desc":   "Newest First",
        "customerName:asc": "Customer A → Z",
      },
      monthPresets: {
        current:  "This Month",
        previous: "Last Month",
        all:      "All",
      },
      tabs: {
        all:              "All",
        active:           "Active",
        "pre-production": "Design Room",
        "master-hub":     "Production",
        completed:        "Completed",
        cancelled:        "Cancelled",
      },
      columns: {
        mo:             "MO#",
        customer:       "Customer",
        product:        "Product",
        nvl:            "Mat.",
        status:         "Status",
        dueDate:        "Req. Date",
        nvlSize:        "Mat / Size",
        plating:        "Plating",
        mainStone:      "Main Stone",
        weight:         "Weight (g)",
        stoneType:      "Stone Type",
        stoneSpec:      "Stone Spec",
        weight3d:       "3D Weight (g)",
        workshopWeight: "Workshop (g)",
        evaluation:     "Eval.",
        deviation:      "% Dev.",
      },
      sync:       "Sync",
      syncing:    "Syncing...",
      suspended:  "on hold",
      noOrders:   "No orders",
      loadError:  "Failed to load data.",
      retry:      "Retry",
      prev:       "← Prev",
      next:       "Next →",
      orders:     "MO",
      cachedNote: "cached data, sync for latest",
      search:     "Search order, customer, sales, MO#, product...",
      panel: {
        tabOrder:      "Order",
        tabItems:      "Items",
        tabStatus:     "Status",
        tabHistory:    "History",
        tabTechnical:  "Technical",
        tabProduction: "Production",
        tabProgress:   "Progress",
        sectionCustomer:         "Customer Info",
        sectionGeneral:          "General Info",
        sectionTimeline:         "Timeline & Priority (per-MO)",
        sectionStatus:           "Status",
        sectionAlerts:           "Special Alerts",
        sectionPromote:          "Send to Production",
        sectionWorkshop:         "Workshop",
        sectionTechnicalInfo:    "Technical Specs",
        sectionProductionDetail: "Production Detail",
        sectionWeightStatus:     "Status & Weight",
        sectionResults:          "Completion Results",
        sectionProgress:         "Stage Progress",
        sectionHistoryTitle:     "Update History",
        fieldCreatedDate:  "Created",
        fieldCustomer:     "Customer",
        fieldCustomerType: "Customer Type",
        fieldSales:        "Sales",
        fieldSource:       "Source",
        fieldStarOrder:    "3-Star",
        fieldChatLink:     "Chat Link",
        fieldPriority:     "Priority",
        fieldCommitDate:   "Prod. Date",
        fieldRequiredDate: "Est. Completion",
        fieldEstWeek:      "Est. Week",
        fieldStatusMo:     "MO Status",
        fieldWorkshop:     "Workshop",
        fieldSupervisor:   "Supervisor",
        cantEdit:  "Read-Only",
        canEdit:   "Editable",
        yes: "Yes",
        no:  "No",
        statusPlaceholder:     "-- Select status --",
        loadError:             "Failed to load order.",
        retry:                 "Retry",
        reload:                "Reload",
        close:                 "Close",
        save:                  "Save Changes",
        saved:                 "Saved",
        cancel:                "Cancel",
        processing:            "Processing...",
        promoteBtn:            "Send to Production →",
        confirmPromote:        "Confirm Transfer",
        moDefaultHint:         "(default = SO#)",
        promoteNotePlaceholder: "Transfer notes (optional)...",
        confirmRollback:       "Confirm Redesign",
        versionToggle:         "Create snapshot on save",
        versionToggleOn:       "Snapshot will be created — original preserved",
        versionToggleOff:      "Save directly to current order",
        modified:              "Modified",
        missingNvl:            "Missing Mat.",
        locked:                "LOCKED",
        specsLocked:           "Product specs are locked. To edit → click Redesign to send back to Design Room.",
        specsLockedPartial:    "Product specs are view-only. Enter the Sample Code in the first field below, then click Save.",
        noItems:               "No items yet.",
        missingNvlWarning:     "All items must have material set before sending to production.",
        viewFile3d:            "View 3D File",
        fieldMainStone:        "Main Stone",
        fieldSlabStone:        "Slab Stone",
        fieldTechClass:        "Tech. Class",
        fieldLoaiHang:         "Goods Type",
        fieldStoneShape:       "Stone Shape",
        fieldProductDesc:      "Prod. Desc.",
        fieldProductNote:      "Item Notes",
        fieldTho3d:            "3D Designer",
        phTho3d:               "3D designer name",
        fieldSku:              "SKU",
        phSku:                 "SKU code",
        fieldChiTietKt:        "Tech. Notes",
        phChiTietKt:           "Technical notes in detail...",
        fieldMoStatus:         "MO Status",
        fieldCurrentStage:     "Current Stage",
        notStarted:            "Not started",
        fieldQd24k:            "24K Conv. (g)",
        fieldQdPt:             "Plat. Conv. (g)",
        fieldQdBac:            "Silver Conv. (g)",
        autoCalc:              "auto",
        phCompletionInfo:      "Completion details...",
        fieldInternalNote:     "Internal Note",
        phInternalNote:        "Internal workshop notes...",
        bannerInStage:         "Currently at stage",
        bannerLastStage:       "Next stage",
        colStage:              "Stage",
        colCrafter:            "Crafter",
        phCrafter:             "Crafter name",
        alertCount:            "alerts",
      },
      form: {
        orderInfo:          "Order Information",
        productList:        "Product List",
        productUnit:        "products",
        flowProduction:     "Direct Production",
        flowPreProd:        "Design Room",
        flowHintProduction: "Flow: Production",
        flowHintPreProd:    "Flow: Design Room",
        soOdoo:             "SO# (Odoo)",
        customer:           "Customer",
        sales:              "Sales",
        source:             "Source",
        customerType:       "Customer Type",
        priority:           "Priority",
        commitDate:         "Production Date",
        expectedDate:       "Expected Completion",
        starOrder:          "3-Star Order",
        starYes:            "Yes ★★★",
        starNo:             "No",
        chatLink:           "Chat Link",
        salesNote:          "Sales Notes",
        productLabel:       "Product",
        tenSp:              "Product Name",
        moNumber:           "MO#",
        nvl:                "Material",
        size:               "Size",
        plating:            "Plating",
        weightReq:          "Req. Wt. (g)",
        mainStone:          "Main Stone Type",
        mainStoneSpec:      "Main Stone Spec",
        slabStoneSpec:      "Slab Stone Spec",
        designFile:         "Design / 3D File",
        productDesc:        "Product Description",
        productNote:        "Product Notes",
        addProduct:         "Add Product",
        duplicate:          "Duplicate",
        remove:             "Remove ×",
        save:               "SAVE ORDER",
        saving:             "Processing...",
        cancel:             "Cancel",
        select:             "-- Select --",
        notSet:             "-- Not set --",
        days:               "days",
        quantity:           "Qty",
        phCustomer:         "Enter customer name",
        phSales:            "Enter sales name",
        phSalesNote:        "Additional notes about the order...",
        phProductDesc:      "Describe technical requirements in detail...",
        phProductNote:      "E.g.: comfortable fit, soft edges, no sharp corners...",
        autoDateHint:       "Auto-calculated — adjustable",
        manualDate:         "Manually adjusted",
        moHint:             "Product identifier — e.g.: 26.10680",
        soHint:             "Odoo order number — e.g.: 26.10680",
        soChecking:         "Checking...",
        soValid:            "SO# is valid",
        soTaken:            "SO# already exists",
        viewOrder:          "View Order",
        searching:          "searching...",
        footerNote:         "SO# and MO# must be filled from Odoo",
        footerSoEmpty:      "SO#: not entered",
        phSalesNoteSidebar: "Sales notes...",
        phSizeSidebar:      "e.g.: 6.1in, 52mm",
        phMainStoneSidebar: "e.g.: 5.4mm × 1pc",
        phSlabStoneSidebar: "e.g.: RD2.2mm",
      },
      dashboard: {
        total:           "Total Orders",
        totalSub:        "All MOs",
        designRoom:      "Design Room",
        designSub:       "In design",
        productionRoom:  "Production",
        productionSub:   "Workshop",
        overdue:         "Overdue",
        overdueSub:      "Past due date",
        suspendedLabel:  "MOs on hold",
        criticalLabel:   "unresolved CRITICAL alerts",
        viewLink:        "View →",
        goldTitle:       "Gold Preparation Estimate",
        goldHeader:      "Gold Needed",
        goldSo:          "SO in production",
        goldNote:        "* Only counts SO not yet past Casting stage. Uses 3D weight if available, otherwise req. weight. +5% waste.",
        goldEmpty:       "No orders in production need gold preparation.",
        goldEmptyHint:   "Orders in Production not yet past Casting will appear here.",
        goldMa:          "SO#",
        goldCustomer:    "Customer",
        goldNvl:         "Mat.",
        goldDelivery:    "Delivery",
        goldWeight3d:    "3D Weight (g)",
        goldCasting:     "Casting (+5%)",
        quickAccess:     "Quick Access",
        createOrder:     "+ New Order",
        designRoomLink:  "Design Room",
        productionLink:  "Production",
        suspendedLink:   "On Hold",
      },
      alerts: {
        pageTitle:         "Alerts",
        criticalCount:     "unresolved CRITICAL alerts",
        createBtn:         "New Alert",
        unresolved:        "Unresolved",
        resolvedTab:       "Resolved",
        noAlerts:          "No alerts to process.",
        createTitle:       "Create New Alert",
        resolveTitle:      "Resolve Alert",
        chooseOrder:       "Order *",
        chooseMo:          "MO to alert *",
        typeLabel:         "Alert Type",
        severityLabel:     "Severity",
        severityLow:       "Low",
        severityMedium:    "Medium",
        severityHigh:      "High",
        severityCritical:  "Critical",
        typeSPECIAL:            "Special",
        typeMATERIAL_SHORTAGE:  "Material Shortage",
        typeRUSH_ORDER:         "Rush Order",
        typeQUALITY_ISSUE:      "Quality Issue",
        typeDESIGN_CHANGE:      "Design Change",
        typeCUSTOMER_COMPLAINT: "Customer Complaint",
        titleField:        "Title *",
        descField:         "Details (optional)",
        autoSuspendWarning: "Alert will automatically put the order on hold and replace any existing alert.",
        creating:          "Creating...",
        createConfirm:     "Create Alert",
        suspendedBadge:    "On Hold",
        resolveBtn:        "Resolve",
        resolveAction:     "Select action *",
        resumeLabel:       "Resume Production",
        resumeDesc:        "Remove hold, order continues processing normally",
        showroomLabel:     "Convert to Showroom",
        showroomDesc:      "Convert to Showroom item, append -SR suffix and resume production",
        rollbackLabel:     "Redesign",
        rollbackDesc:      "Send MO back to Design Room for rework",
        cancelLabel:       "Cancel Order",
        cancelDesc:        "Cancel the entire order — cannot be undone",
        noteCancelLabel:   "Cancellation reason *",
        noteRollbackLabel: "Redesign reason (optional)",
        noteGenericLabel:  "Note (optional)",
        placeholderCancel:   "Enter cancellation reason...",
        placeholderRollback: "Describe reason for redesign...",
        placeholderGeneric:  "Describe how the issue was resolved...",
        cancelWarning:     "This action will permanently cancel the order and cannot be undone.",
        rollbackWarning:   "Production data will be saved as a snapshot before sending to Design Room.",
        processing:        "Processing...",
        confirm:           "Confirm",
        cancelBtn:         "Cancel",
        badgeCancelled:    "CANCELLED",
        badgeShowroom:     "SHOWROOM",
        badgeResume:       "RESUMED",
        resolvedLabel:     "Resolved",
        orderStatus:       "Order status:",
        onHoldStatus:      "On hold",
      },
      table: {
        orderDate:      "Date",
        requiredDate:   "Due Date",
        estimatedDate:  "Commit Date",
        estimatedDateShort: "Commit",
        requiredDateShort:  "Due",
        status:         "Status",
        tenSp:          "Product",
        customer:       "Customer",
        ghiChuSp:       "Item Notes",
        ghiChuSales:    "Sales Notes",
        mainStone:      "Main Stone",
        congDoan:       "Stage",
        tlXuong:        "Drop Wt. (g)",
        tl3d:           "3D Wt. (g)",
        warning:        "Alert",
        source:         "Source",
        customerType:   "Cust. Type",
        priority:       "Priority",
        plating:        "Plating",
        designFile3D:   "3D File",
        weightReq:      "Req. Wt. (g)",
        weightWorkshop: "Wkshp Wt. (g)",
        techClass:      "Tech. Class",
        stoneType:      "Stone Type",
        slabStone:      "Slab Stone",
        completedDate:  "Completed",
        weightActual:   "Actual Wt. (g)",
        weightEval:     "Weight Eval",
        pctDiff:        "% Diff",
        completionInfo: "Completion Info",
        specialAlert:   "Special Alert",
        loading:        "Loading...",
        noOrders:       "No orders yet",
        noMatch:        "No orders match the current filters",
        clearFilters:   "Clear Filters",
        noOrdersCount:  "No orders",
        showing:        "Showing",
        ordersWord:     "MO",
        perPage:        "/ page",
        view:           "View",
      },
      toolbar: {
        searchPlaceholder: "Search order, customer, sales, MO#, product...",
        priority:       "Priority",
        filter:         "Filter",
        clearFilter:    "Clear",
        orders:         "MO",
        statusLabel:    "Status",
        allStatuses:    "All",
        dateCreated:    "Date",
        deadline:       "Deadline",
        next7Days:      "Next 7 days",
        overdueLabel:   "Overdue",
        dateFrom:       "From",
        dateTo:         "To",
        sort:           "Sort",
        today:          "Today",
        days7:          "7 days",
        days30:         "30 days",
        allDates:       "All",
        sortOrderDateDesc:      "Date (newest)",
        sortOrderDateAsc:       "Date (oldest)",
        sortRequiredDateAsc:    "Deadline (nearest)",
        sortRequiredDateDesc:   "Deadline (farthest)",
        sortCustomerNameAsc:    "Customer (A → Z)",
        sortEstimatedTotalDesc: "Value (high → low)",
      },
    },
    stoneTypes: ["NATURAL DIAMOND", "LAB DIAMOND", "CZ", "COLORED STONE", "PEARL"],
    phanLoaiKt: ["TRƠN", "NATURAL", "M.MÁY", "LAB", "CZ", "ĐÁ", "ĐÁ MÀU", "NGỌC TRAI"],
    hinhDangHot: [
      "Round/RD", "Princess/PR", "Baguette/BG", "Tapered/TD",
      "Cushion/CU", "Oval/OV", "Emerald/EMR",
      "Pear/PS", "Heart/HS", "Marquise/MQ", "Asscher/AS",
      "Radiant/RAD", "Triangle/TR", "Half Moon/HM", "Pearl/RD-P",
    ],
    tenSp: [
      "Ring Mount",
      "Diamond Ring Mount", "Plain Ring Mount", "Diamond Band", "Plain Band",
      "Diamond Pendant Mount", "Plain Pendant Mount", "Diamond Pendant", "Plain Pendant",
      "Diamond Bracelet Mount", "Plain Bracelet Mount", "Diamond Bracelet", "Diamond Earring Mount",
      "Plain Earring Mount", "Diamond Earrings", "Plain Earrings", "Diamond Bangle Mount",
      "Plain Bangle Mount", "Diamond Bangle", "Plain Bangle", "Necklace",
      "Diamond Necklace Mount", "Plain Necklace Mount", "Diamond Necklace", "Plain Necklace",
      "Accessory", "Charm",
      "Chain Bracelet", "Nose Ring",
    ],
    techClass: ["Plain", "CZ Set", "CNC", "Laser", "Hand Engrave", "Center Stone Setting", "Pavé Setting", "Mixed"],
  },
};
